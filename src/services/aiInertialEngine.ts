/**
 * Edge AI Inertial Odometry Engine.
 * Executes on-device Transformer neural network inference via ONNX Runtime Web with WebGPU acceleration.
 * Loads self-contained Uint8Array binary buffers to eliminate any external file dependencies.
 */

import * as ort from 'onnxruntime-web';

export interface AIInferenceMetrics {
  isLoaded: boolean;
  isLoading: boolean;
  executionProvider: 'webgpu' | 'wasm' | 'cpu' | 'initializing' | 'failed';
  lastLatencyMs: number;
  avgLatencyMs: number;
  totalInferences: number;
  lastDisplacement: { dx: number; dy: number; magnitude: number };
  predictedSpeedMps: number;
  predictedHeadingDeltaDeg: number;
  modelName: string;
  errorMessage?: string;
}

export type AIStateListener = (metrics: AIInferenceMetrics) => void;

export class AIInertialEngine {
  private session: ort.InferenceSession | null = null;
  private isInitializing: boolean = false;
  private seqLen: number = 20;
  private inFeatures: number = 6;
  
  // Rolling IMU buffer: [ax, ay, az, gz_rad, gx_rad, gy_rad]
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
    predictedSpeedMps: 0,
    predictedHeadingDeltaDeg: 0,
    modelName: 'IO-VNBD Transformer (MHSA, d=64, 4-Head)',
  };

  private latencies: number[] = [];
  private listeners: Set<AIStateListener> = new Set();

  constructor() {
    // Configure ONNX Runtime Web WASM options
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
   * Fetches the self-contained ONNX model as an ArrayBuffer and creates an ONNX Runtime session
   * using WebGPU with WASM fallback.
   */
  public async initializeModel(modelUrl: string = '/models/inertial_transformer.onnx'): Promise<boolean> {
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
      console.log(`[AI Engine] Downloaded model buffer (${(modelBytes.byteLength / 1024).toFixed(1)} KB). Initializing session...`);

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
          console.log('[AI Engine] Successfully initialized with WebGPU execution provider.');
        } else {
          throw new Error('WebGPU not supported on this browser context.');
        }
      } catch (webGpuErr) {
        console.warn('[AI Engine] WebGPU initialization notice (switching to WASM SIMD):', webGpuErr);
        // 2. Fallback to WASM SIMD
        session = await ort.InferenceSession.create(modelBytes, {
          executionProviders: ['wasm'],
          graphOptimizationLevel: 'all',
        });
        usedProvider = 'wasm';
        console.log('[AI Engine] Successfully initialized with WASM SIMD execution provider.');
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
      console.error('[AI Engine] Failed to initialize ONNX Runtime session:', err);
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
   * Pushes a real-time IMU sample into the rolling buffer and executes inference if interval elapsed
   */
  public processImuSample(
    ax: number,
    ay: number,
    az: number,
    gxDeg: number,
    gyDeg: number,
    gzDeg: number,
    currentLat: number,
    currentLng: number,
    currentHeadingDeg: number,
    timestamp: number = Date.now()
  ): { newLat: number; newLng: number; displacementMeters: number; speedMps: number; isAiUpdated: boolean } {
    // Convert gyro to rad/s matching IO-VNBD dataset standard
    const degToRad = Math.PI / 180;
    const sample = [ax, ay, az, gzDeg * degToRad, gxDeg * degToRad, gyDeg * degToRad];

    this.imuBuffer.push(sample);
    if (this.imuBuffer.length > this.seqLen) {
      this.imuBuffer.shift();
    }

    if (!this.session || this.imuBuffer.length < this.seqLen) {
      return { newLat: currentLat, newLng: currentLng, displacementMeters: 0, speedMps: 0, isAiUpdated: false };
    }

    if (timestamp - this.lastInferenceTime < this.inferenceIntervalMs) {
      return { newLat: currentLat, newLng: currentLng, displacementMeters: 0, speedMps: 0, isAiUpdated: false };
    }

    this.lastInferenceTime = timestamp;

    // Run Asynchronous Transformer Inference
    this.runInference(currentLat, currentLng, currentHeadingDeg);

    return {
      newLat: currentLat,
      newLng: currentLng,
      displacementMeters: this.metrics.lastDisplacement.magnitude,
      speedMps: this.metrics.predictedSpeedMps,
      isAiUpdated: true,
    };
  }

  private async runInference(_currentLat: number, _currentLng: number, _currentHeadingDeg: number) {
    if (!this.session || this.imuBuffer.length < this.seqLen) return;

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

      // Extract output tensor
      const outputTensor = results.odometry_output || Object.values(results)[0];
      const outData = outputTensor.data as Float32Array;

      const dx = outData[0] || 0;
      const dy = outData[1] || 0;
      const speed = Math.max(0, outData[2] || 0);
      const deltaThetaRad = outData[3] || 0;
      const deltaThetaDeg = deltaThetaRad * (180 / Math.PI);

      const magnitude = Math.sqrt(dx * dx + dy * dy);

      // Latency stats
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
      this.metrics.predictedSpeedMps = Number(speed.toFixed(2));
      this.metrics.predictedHeadingDeltaDeg = Number(deltaThetaDeg.toFixed(2));

      this.notify();
    } catch (inferErr) {
      console.warn('[AI Engine] Inference evaluation notice:', inferErr);
    }
  }

  public reset() {
    this.imuBuffer = [];
    this.lastInferenceTime = 0;
    this.latencies = [];
    this.metrics.lastDisplacement = { dx: 0, dy: 0, magnitude: 0 };
    this.metrics.predictedSpeedMps = 0;
    this.metrics.totalInferences = 0;
    this.notify();
  }
}

// Global Singleton Instance
export const aiInertialEngine = new AIInertialEngine();
