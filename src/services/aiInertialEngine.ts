/**
 * Edge AI Inertial Odometry Engine.
 * 
 * Pipeline:
 * 1. Sensor data is recorded (6-DOF Accelerometer + Gyroscope + Heading)
 * 2. Sensor data is smoothened using Gaussian filtering
 * 3. Data is displayed via state subscribers
 * 4. Zero-Velocity (ZUPT) Gating + ONNX MLP inference (WebGPU / WASM)
 * 5. Output displacement [dx, dy] is plotted onto the map
 */

import * as ort from 'onnxruntime-web';
import { GaussianIMUFilter6D } from '../utils/filter';

export interface AIInferenceMetrics {
  isLoaded: boolean;
  isLoading: boolean;
  executionProvider: 'webgpu' | 'wasm' | 'cpu' | 'initializing' | 'failed';
  lastLatencyMs: number;
  avgLatencyMs: number;
  totalInferences: number;
  lastDisplacement: { dx: number; dy: number; magnitude: number };
  // Instantaneous kinematic values (non-averaged)
  instantaneousSpeedMps: number;
  instantaneousSpeedKmh: number;
  instantaneousTurnDeltaDeg: number;
  isStationary: boolean;
  motionVariance: number;
  modelName: string;
  errorMessage?: string;
}

export type AIStateListener = (metrics: AIInferenceMetrics) => void;

export class AIInertialEngine {
  private session: ort.InferenceSession | null = null;
  private isInitializing: boolean = false;
  private seqLen: number = 20;
  private inFeatures: number = 6;
  
  // 1. Gaussian 6-DOF filter instance (Kernel Size: 7, Sigma: 1.2)
  private gaussianFilter = new GaussianIMUFilter6D(7, 1.2);
  
  // Rolling IMU buffer of Gaussian-smoothed features: [ax, ay, az, gz_rad, gx_rad, gy_rad]
  private imuBuffer: number[][] = [];
  private lastInferenceTime: number = 0;
  private inferenceIntervalMs: number = 200; // 5Hz inference rate for smooth real-time tracking
  
  private metrics: AIInferenceMetrics = {
    isLoaded: false,
    isLoading: false,
    executionProvider: 'initializing',
    lastLatencyMs: 0,
    avgLatencyMs: 0,
    totalInferences: 0,
    lastDisplacement: { dx: 0, dy: 0, magnitude: 0 },
    instantaneousSpeedMps: 0,
    instantaneousSpeedKmh: 0,
    instantaneousTurnDeltaDeg: 0,
    isStationary: true,
    motionVariance: 0,
    modelName: 'IO-VNBD Inertial MLP (Dense 120 -> 256 -> 128 -> 64)',
  };

  private latencies: number[] = [];
  private listeners: Set<AIStateListener> = new Set();

  constructor() {
    try {
      ort.env.wasm.numThreads = Math.min(4, navigator.hardwareConcurrency || 2);
      ort.env.wasm.simd = true;
    } catch {}
  }

  public subscribe(listener: AIStateListener): () => void {
    this.listeners.add(listener);
    listener(this.getMetrics());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const state = this.getMetrics();
    this.listeners.forEach((listener) => listener(state));
  }

  public getMetrics(): AIInferenceMetrics {
    return { ...this.metrics };
  }

  /**
   * Initializes the ONNX MLP session from a monolithic binary buffer
   */
  public async initializeModel(modelUrl: string = '/models/inertial_mlp.onnx'): Promise<boolean> {
    if (this.session) return true;
    if (this.isInitializing) return false;

    this.isInitializing = true;
    this.metrics.isLoading = true;
    this.notify();

    try {
      console.log(`[AI Engine] Fetching monolithic ONNX model buffer from ${modelUrl}...`);
      const response = await fetch(modelUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} fetching model: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const modelBytes = new Uint8Array(arrayBuffer);
      console.log(`[AI Engine] Model downloaded (${(modelBytes.byteLength / 1024).toFixed(1)} KB). Initializing session...`);

      let session: ort.InferenceSession | null = null;
      let usedProvider: 'webgpu' | 'wasm' = 'webgpu';

      // 1. Attempt WebGPU Execution Provider
      try {
        if ('gpu' in navigator) {
          session = await ort.InferenceSession.create(modelBytes, {
            executionProviders: ['webgpu'],
            graphOptimizationLevel: 'all',
          });
          usedProvider = 'webgpu';
          console.log('[AI Engine] Initialized with WebGPU execution provider.');
        } else {
          throw new Error('WebGPU not supported.');
        }
      } catch (webGpuErr) {
        console.warn('[AI Engine] Falling back to WASM SIMD provider:', webGpuErr);
        session = await ort.InferenceSession.create(modelBytes, {
          executionProviders: ['wasm'],
          graphOptimizationLevel: 'all',
        });
        usedProvider = 'wasm';
        console.log('[AI Engine] Initialized with WASM SIMD provider.');
      }

      this.session = session;
      this.metrics.isLoaded = true;
      this.metrics.isLoading = false;
      this.metrics.executionProvider = usedProvider;
      this.metrics.errorMessage = undefined;
      this.isInitializing = false;
      this.notify();
      return true;
    } catch (err: any) {
      console.error('[AI Engine] Initialization error:', err);
      this.metrics.isLoaded = false;
      this.metrics.isLoading = false;
      this.metrics.executionProvider = 'failed';
      this.metrics.errorMessage = err?.message || 'Model initialization failed';
      this.isInitializing = false;
      this.notify();
      return false;
    }
  }

  /**
   * Pipeline Steps 1, 2, 4:
   * 1. Record raw sensor data
   * 2. Gaussian smoothing of 6-DOF IMU channels
   * 4. Feed Gaussian-smoothed sequence window into ONNX MLP
   */
  public processSensorSample(
    rawAx: number,
    rawAy: number,
    rawAz: number,
    rawGxDeg: number,
    rawGyDeg: number,
    rawGzDeg: number,
    timestamp: number = Date.now(),
    onInferenceOutput?: (displacementMeters: number, instantaneousSpeedMps: number, instantaneousHeadingDeltaDeg: number) => void
  ): {
    smoothedAx: number;
    smoothedAy: number;
    smoothedAz: number;
    smoothedGx: number;
    smoothedGy: number;
    smoothedGz: number;
    accelMagnitude: number;
    gyroMagnitude: number;
  } {
    // Step 2: Gaussian Smoothing across all 6 IMU channels
    const smoothed = this.gaussianFilter.process(
      rawAx,
      rawAy,
      rawAz,
      rawGxDeg,
      rawGyDeg,
      rawGzDeg
    );

    // Convert smoothed gyro to rad/s matching IO-VNBD dataset standard
    const degToRad = Math.PI / 180;
    const sample = [
      smoothed.ax,
      smoothed.ay,
      smoothed.az,
      smoothed.gz * degToRad,
      smoothed.gx * degToRad,
      smoothed.gy * degToRad,
    ];

    this.imuBuffer.push(sample);
    if (this.imuBuffer.length > this.seqLen) {
      this.imuBuffer.shift();
    }

    // Step 4: Pass through ONNX when window buffer is ready
    if (this.session && this.imuBuffer.length >= this.seqLen) {
      if (timestamp - this.lastInferenceTime >= this.inferenceIntervalMs) {
        this.lastInferenceTime = timestamp;
        this.runInference(onInferenceOutput);
      }
    }

    return {
      smoothedAx: smoothed.ax,
      smoothedAy: smoothed.ay,
      smoothedAz: smoothed.az,
      smoothedGx: smoothed.gx,
      smoothedGy: smoothed.gy,
      smoothedGz: smoothed.gz,
      accelMagnitude: smoothed.accelMagnitude,
      gyroMagnitude: smoothed.gyroMagnitude,
    };
  }

  private async runInference(
    onInferenceOutput?: (displacementMeters: number, instantaneousSpeedMps: number, instantaneousHeadingDeltaDeg: number) => void
  ) {
    if (!this.session || this.imuBuffer.length < this.seqLen) return;

    // Physical Zero-Velocity Detection (ZUPT Anti-Drift Gate)
    let sumNorm = 0;
    let sumSqNorm = 0;
    let sumGyro = 0;
    const n = this.imuBuffer.length;

    for (let i = 0; i < n; i++) {
      const [ax, ay, az, gz, gx, gy] = this.imuBuffer[i];
      const norm = Math.sqrt(ax * ax + ay * ay + az * az);
      const gyroNormDeg = Math.sqrt(gx * gx + gy * gy + gz * gz) * (180 / Math.PI);
      sumNorm += norm;
      sumSqNorm += norm * norm;
      sumGyro += gyroNormDeg;
    }

    const meanNorm = sumNorm / n;
    const accelVariance = Math.max(0, (sumSqNorm / n) - (meanNorm * meanNorm));
    const avgGyroDeg = sumGyro / n;

    // Device is static if dynamic acceleration variance is small and angular rates are near zero
    const isStationary = accelVariance < 0.05 && avgGyroDeg < 1.8;

    this.metrics.isStationary = isStationary;
    this.metrics.motionVariance = Number(accelVariance.toFixed(4));

    if (isStationary) {
      // Hard physical zero-velocity clamp (Eliminates stationary drift completely!)
      this.metrics.lastDisplacement = { dx: 0, dy: 0, magnitude: 0 };
      this.metrics.instantaneousSpeedMps = 0;
      this.metrics.instantaneousSpeedKmh = 0;
      this.metrics.instantaneousTurnDeltaDeg = 0;
      this.notify();

      if (onInferenceOutput) {
        onInferenceOutput(0, 0, 0);
      }
      return;
    }

    const t0 = performance.now();

    try {
      // Flatten (20, 6) into Float32Array (1, 20, 6)
      const flatData = new Float32Array(this.seqLen * this.inFeatures);
      for (let i = 0; i < this.seqLen; i++) {
        for (let j = 0; j < this.inFeatures; j++) {
          flatData[i * this.inFeatures + j] = this.imuBuffer[i][j];
        }
      }

      const inputTensor = new ort.Tensor('float32', flatData, [1, this.seqLen, this.inFeatures]);
      const feeds: Record<string, ort.Tensor> = { imu_sequence: inputTensor };

      const results = await this.session.run(feeds);
      const latency = performance.now() - t0;

      // Extract output tensor [dx, dy, instantaneous_speed, instantaneous_delta_theta]
      const outputTensor = results.odometry_output || Object.values(results)[0];
      const outData = outputTensor.data as Float32Array;

      const dx = outData[0] || 0;
      const dy = outData[1] || 0;
      // Pure instantaneous speed (m/s)
      const instSpeedMps = Math.max(0, outData[2] || 0);
      const instSpeedKmh = instSpeedMps * 3.6;

      // Pure instantaneous turn delta (deg)
      const instDeltaThetaRad = outData[3] || 0;
      const instDeltaThetaDeg = instDeltaThetaRad * (180 / Math.PI);

      const magnitude = Math.sqrt(dx * dx + dy * dy);

      // Latency tracking
      this.latencies.push(latency);
      if (this.latencies.length > 50) this.latencies.shift();
      const avgLatency = this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length;

      this.metrics.lastLatencyMs = Number(latency.toFixed(2));
      this.metrics.avgLatencyMs = Number(avgLatency.toFixed(2));
      this.metrics.totalInferences += 1;
      this.metrics.lastDisplacement = {
        dx: Number(dx.toFixed(3)),
        dy: Number(dy.toFixed(3)),
        magnitude: Number(magnitude.toFixed(3)),
      };
      // Pure instantaneous updates (no moving average)
      this.metrics.instantaneousSpeedMps = Number(instSpeedMps.toFixed(2));
      this.metrics.instantaneousSpeedKmh = Number(instSpeedKmh.toFixed(1));
      this.metrics.instantaneousTurnDeltaDeg = Number(instDeltaThetaDeg.toFixed(2));

      this.notify();

      // Step 5 trigger: pass instantaneous output to location engine
      if (onInferenceOutput) {
        onInferenceOutput(magnitude, instSpeedMps, instDeltaThetaDeg);
      }
    } catch (inferErr) {
      console.warn('[AI Engine] Inference notice:', inferErr);
    }
  }

  public reset() {
    this.gaussianFilter.reset();
    this.imuBuffer = [];
    this.lastInferenceTime = 0;
    this.latencies = [];
    this.metrics.lastDisplacement = { dx: 0, dy: 0, magnitude: 0 };
    this.metrics.instantaneousSpeedMps = 0;
    this.metrics.instantaneousSpeedKmh = 0;
    this.metrics.instantaneousTurnDeltaDeg = 0;
    this.metrics.isStationary = true;
    this.metrics.motionVariance = 0;
    this.metrics.totalInferences = 0;
    this.notify();
  }
}

// Global Singleton Instance
export const aiInertialEngine = new AIInertialEngine();
