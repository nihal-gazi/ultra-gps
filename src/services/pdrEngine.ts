/**
 * Pedestrian Dead Reckoning (PDR) & Neural Inertial Engine.
 * Integrates Edge Transformer Inference (ONNX WebGPU), Accelerometer, Gyroscope, Geodesy, and ZUPT Gating.
 */

import type {
  Coordinates,
  HeadingData,
  MotionSample,
  PathPoint,
  StepMetrics,
  TrackingMode,
  CalibrationConfig,
  WalkDirection,
} from '../types';
import { calculateDestinationPoint, calculateHaversineDistance } from '../utils/geodesy';
import { OrientationInvariantGravityFilter, LowPassFilter, StepDetector } from '../utils/filter';
import { SmoothHeadingFilter, computeRobustCompassHeading, normalizeDegrees } from '../utils/orientation';
import { aiInertialEngine } from './aiInertialEngine';

export interface PDRState {
  mode: TrackingMode;
  currentLocation: Coordinates;
  headingData: HeadingData;
  stepMetrics: StepMetrics;
  recentMotion: MotionSample[];
  pathHistory: PathPoint[];
  config: CalibrationConfig;
  hasReceivedFix: boolean;
  isAiEnabled: boolean;
}

export type PDRStateListener = (state: PDRState) => void;

export class PDREngine {
  private mode: TrackingMode = 'SEARCHING_GPS';
  private hasReceivedFix: boolean = false;
  private hasPreciseGpsFix: boolean = false;
  private isAiEnabled: boolean = true;

  private currentLocation: Coordinates = {
    latitude: 28.6139,
    longitude: 77.2090,
    accuracy: 10,
    speed: 0,
    heading: 0,
  };

  private headingData: HeadingData = {
    heading: 0,
    rawHeading: 0,
    source: 'fallback',
    pitch: 0,
    roll: 0,
    calibrated: false,
  };

  private stepMetrics: StepMetrics = {
    stepCount: 0,
    lastStepTimestamp: 0,
    cadence: 0,
    currentStepLength: 0.7,
    totalDistance: 0,
    speedMps: 0,
    speedKmh: 0,
    isStationary: true,
    motionVariance: 0,
    walkDirection: 'FORWARD',
    directionMode: 'AUTO',
    aiDisplacementMeters: 0,
    aiHeadingDeltaDeg: 0,
  };

  private config: CalibrationConfig = {
    weinbergK: 0.45,
    peakThreshold: 0.25,
    minStepIntervalMs: 200,
    smoothingFactor: 0.35,
    gyroWeight: 0.94,
    stationaryVarianceThreshold: 0.02,
  };

  private recentMotion: MotionSample[] = [];
  private readonly maxMotionSamples = 80;
  private pathHistory: PathPoint[] = [];
  private readonly maxPathPoints = 500;

  // Filter instances
  private gravityFilter = new OrientationInvariantGravityFilter();
  private magnitudeLpf = new LowPassFilter(0.35);
  private stepDetector = new StepDetector(0.45, 0.25, 200, 0.02, 9);
  private headingFilter = new SmoothHeadingFilter(0);

  // Step timestamps for cadence calculation (sliding window of 10s)
  private stepTimestamps: number[] = [];

  // Listeners
  private listeners: Set<PDRStateListener> = new Set();

  constructor(initialLocation?: { lat: number; lng: number }) {
    if (initialLocation) {
      this.currentLocation.latitude = initialLocation.lat;
      this.currentLocation.longitude = initialLocation.lng;
    }
  }

  public subscribe(listener: PDRStateListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const state = this.getState();
    this.listeners.forEach((listener) => listener(state));
  }

  public getState(): PDRState {
    return {
      mode: this.mode,
      currentLocation: { ...this.currentLocation },
      headingData: { ...this.headingData },
      stepMetrics: { ...this.stepMetrics },
      recentMotion: [...this.recentMotion],
      pathHistory: [...this.pathHistory],
      config: { ...this.config },
      hasReceivedFix: this.hasReceivedFix,
      isAiEnabled: this.isAiEnabled,
    };
  }

  public setMode(newMode: TrackingMode) {
    this.mode = newMode;
    this.notify();
  }

  public toggleAiMode() {
    this.isAiEnabled = !this.isAiEnabled;
    this.notify();
  }

  public setDirectionMode(dirMode: 'AUTO' | 'FORWARD' | 'BACKWARD') {
    this.stepMetrics.directionMode = dirMode;
    if (dirMode !== 'AUTO') {
      this.stepMetrics.walkDirection = dirMode;
    }
    this.notify();
  }

  public updateCalibration(partialConfig: Partial<CalibrationConfig>) {
    this.config = { ...this.config, ...partialConfig };
    this.stepDetector.updateConfig(
      this.config.weinbergK,
      this.config.peakThreshold,
      this.config.minStepIntervalMs,
      this.config.stationaryVarianceThreshold
    );
    this.notify();
  }

  public setInitialApproximateLocation(lat: number, lng: number) {
    if (this.hasPreciseGpsFix) return;

    this.currentLocation.latitude = lat;
    this.currentLocation.longitude = lng;
    this.hasReceivedFix = true;
    this.recordPathPoint(lat, lng, Date.now(), 'SEARCHING_GPS', this.headingData.heading, 'FORWARD', 500);
    this.notify();
  }

  public updateGpsPosition(coords: GeolocationCoordinates, timestamp: number = Date.now()) {
    const prevLat = this.currentLocation.latitude;
    const prevLng = this.currentLocation.longitude;

    const lat = coords.latitude;
    const lng = coords.longitude;
    const accuracy = coords.accuracy;
    const altitude = coords.altitude;
    const speed = coords.speed;
    const heading = coords.heading;

    this.hasReceivedFix = true;
    this.hasPreciseGpsFix = true;

    this.currentLocation = {
      latitude: lat,
      longitude: lng,
      accuracy,
      altitude,
      speed: speed ?? 0,
      heading: heading ?? this.headingData.heading,
    };

    if (heading !== null && !isNaN(heading)) {
      this.headingFilter.reset(heading);
      this.headingData.heading = heading;
    }

    if (this.mode === 'GPS' || this.mode === 'SEARCHING_GPS') {
      this.mode = 'GPS';

      if (this.pathHistory.length > 0) {
        const d = calculateHaversineDistance(prevLat, prevLng, lat, lng);
        if (d > 1 && d < 100) {
          this.stepMetrics.totalDistance += d;
        }
      }

      this.recordPathPoint(
        lat,
        lng,
        timestamp,
        'GPS',
        this.headingData.heading,
        'FORWARD',
        accuracy !== null ? accuracy : undefined
      );
    }

    this.notify();
  }

  public updateOrientation(
    alpha: number | null,
    beta: number | null,
    gamma: number | null,
    webkitCompassHeading?: number,
    absolute: boolean = false
  ) {
    let rawHeading = this.headingData.rawHeading;
    let source: HeadingData['source'] = 'fallback';

    if (webkitCompassHeading !== undefined && !isNaN(webkitCompassHeading)) {
      rawHeading = normalizeDegrees(webkitCompassHeading);
      source = 'webkit';
    } else if (alpha !== null && beta !== null && gamma !== null) {
      rawHeading = computeRobustCompassHeading(alpha, beta, gamma);
      source = absolute ? 'absolute' : 'rotation-matrix';
    } else if (alpha !== null && !isNaN(alpha)) {
      rawHeading = normalizeDegrees(360 - alpha);
      source = 'alpha';
    }

    const smoothedHeading = this.headingFilter.filter(rawHeading);

    this.headingData = {
      heading: Number(smoothedHeading.toFixed(1)),
      rawHeading: Number(rawHeading.toFixed(1)),
      source,
      pitch: Number((beta ?? 0).toFixed(1)),
      roll: Number((gamma ?? 0).toFixed(1)),
      calibrated: true,
    };

    this.notify();
  }

  public processDeviceMotion(
    ax: number,
    ay: number,
    az: number,
    gx: number = 0,
    gy: number = 0,
    gz: number = 0,
    hasGravity: boolean = true,
    timestamp: number = Date.now()
  ) {
    let rawMag: number;
    let dynamicAcc: number;

    if (hasGravity) {
      const filtered = this.gravityFilter.process(ax, ay, az);
      rawMag = filtered.rawNorm;
      dynamicAcc = filtered.dynamicAcc;
    } else {
      dynamicAcc = Math.sqrt(ax * ax + ay * ay + az * az);
      rawMag = dynamicAcc;
    }

    const filteredMag = this.magnitudeLpf.filter(dynamicAcc);
    const gyroMag = Math.sqrt(gx * gx + gy * gy + gz * gz);

    // 1. Feed real-time 6-DOF stream into Transformer WebGPU AI Engine
    aiInertialEngine.processImuSample(
      ax,
      ay,
      az,
      gx,
      gy,
      gz,
      this.currentLocation.latitude,
      this.currentLocation.longitude,
      this.headingData.heading,
      timestamp
    );

    // 2. Kinematic Step Detector with ZUPT stationary gating
    const detection = this.stepDetector.processSample(filteredMag, ay, timestamp);

    this.stepMetrics.isStationary = detection.isStationary;
    this.stepMetrics.motionVariance = Number(detection.variance.toFixed(3));

    let effectiveDirection: WalkDirection = detection.detectedDirection;
    if (this.stepMetrics.directionMode !== 'AUTO') {
      effectiveDirection = this.stepMetrics.directionMode;
    }
    this.stepMetrics.walkDirection = effectiveDirection;

    const sample: MotionSample = {
      timestamp,
      ax,
      ay,
      az,
      rawMagnitude: Number(rawMag.toFixed(2)),
      filteredMagnitude: Number(filteredMag.toFixed(2)),
      isPeak: detection.isStep,
      stepLength: detection.stepLength,
      isStationary: detection.isStationary,
      gx: Number(gx.toFixed(1)),
      gy: Number(gy.toFixed(1)),
      gz: Number(gz.toFixed(1)),
      gyroMagnitude: Number(gyroMag.toFixed(1)),
    };

    this.pushMotionSample(sample);

    if (detection.isStep && !detection.isStationary) {
      // If AI model has inferred a neural vector, blend it with Weinberg model
      const aiMetrics = aiInertialEngine.getMetrics();
      let stepLen = detection.stepLength;
      if (aiMetrics.isLoaded && aiMetrics.lastDisplacement.magnitude > 0.1) {
        stepLen = Math.max(0.35, Math.min(1.4, (stepLen * 0.4) + (aiMetrics.lastDisplacement.magnitude * 0.6)));
        this.stepMetrics.aiDisplacementMeters = aiMetrics.lastDisplacement.magnitude;
      }
      this.handleStepDetected(stepLen, effectiveDirection, timestamp);
    } else {
      if (detection.isStationary && Date.now() - this.stepMetrics.lastStepTimestamp > 2500) {
        this.stepMetrics.cadence = 0;
        this.stepMetrics.speedMps = 0;
        this.stepMetrics.speedKmh = 0;
      }
      this.notify();
    }
  }

  public handleStepDetected(
    stepLength: number,
    direction: WalkDirection = 'FORWARD',
    timestamp: number = Date.now()
  ) {
    this.stepMetrics.stepCount += 1;
    this.stepMetrics.lastStepTimestamp = timestamp;
    this.stepMetrics.currentStepLength = stepLength;
    this.stepMetrics.totalDistance += stepLength;
    this.stepMetrics.isStationary = false;
    this.stepMetrics.walkDirection = direction;

    this.stepTimestamps.push(timestamp);
    const tenSecondsAgo = timestamp - 10000;
    this.stepTimestamps = this.stepTimestamps.filter((t) => t >= tenSecondsAgo);
    const cadence = (this.stepTimestamps.length / 10) * 60;
    this.stepMetrics.cadence = Number(cadence.toFixed(1));

    const speedMps = (cadence / 60) * stepLength;
    this.stepMetrics.speedMps = Number(speedMps.toFixed(2));
    this.stepMetrics.speedKmh = Number((speedMps * 3.6).toFixed(2));

    const effectiveBearing =
      direction === 'BACKWARD'
        ? normalizeDegrees(this.headingData.heading + 180)
        : this.headingData.heading;

    if (this.mode === 'DEAD_RECKONING' || this.mode === 'AI_TRANSFORMER' || this.mode === 'SEARCHING_GPS') {
      const { lat: newLat, lng: newLng } = calculateDestinationPoint(
        this.currentLocation.latitude,
        this.currentLocation.longitude,
        stepLength,
        effectiveBearing
      );

      const targetMode: TrackingMode = this.isAiEnabled ? 'AI_TRANSFORMER' : 'DEAD_RECKONING';

      this.currentLocation = {
        ...this.currentLocation,
        latitude: newLat,
        longitude: newLng,
        speed: speedMps,
        heading: this.headingData.heading,
        accuracy: Math.min(50, (this.currentLocation.accuracy ?? 10) + 0.15),
      };

      this.recordPathPoint(
        newLat,
        newLng,
        timestamp,
        targetMode,
        this.headingData.heading,
        direction,
        this.currentLocation.accuracy ?? undefined,
        this.stepMetrics.stepCount
      );
    }

    this.notify();
  }

  public injectSimulatedStep(stepLength: number = 0.72, direction: WalkDirection = 'FORWARD') {
    const now = Date.now();
    const simAx = (Math.random() - 0.5) * 0.4;
    const simAy = direction === 'BACKWARD' ? -2.2 : 2.4;
    const simAz = 9.81 + 1.8;
    const simGx = 12.0;
    const simGy = 6.5;
    const simGz = 4.0;
    this.processDeviceMotion(simAx, simAy, simAz, simGx, simGy, simGz, true, now);
    this.handleStepDetected(stepLength, direction, now);
  }

  public setManualHeading(heading: number) {
    const norm = normalizeDegrees(heading);
    this.headingFilter.reset(norm);
    this.headingData = {
      ...this.headingData,
      heading: norm,
      rawHeading: norm,
      source: 'simulated',
    };
    this.notify();
  }

  public setManualLocation(lat: number, lng: number) {
    this.hasReceivedFix = true;
    this.currentLocation = {
      ...this.currentLocation,
      latitude: lat,
      longitude: lng,
    };
    this.recordPathPoint(lat, lng, Date.now(), this.mode, this.headingData.heading, 'FORWARD', 5);
    this.notify();
  }

  public resetPathAndMetrics() {
    this.stepMetrics = {
      stepCount: 0,
      lastStepTimestamp: 0,
      cadence: 0,
      currentStepLength: 0.7,
      totalDistance: 0,
      speedMps: 0,
      speedKmh: 0,
      isStationary: true,
      motionVariance: 0,
      walkDirection: 'FORWARD',
      directionMode: this.stepMetrics.directionMode,
      aiDisplacementMeters: 0,
      aiHeadingDeltaDeg: 0,
    };
    this.stepTimestamps = [];
    this.pathHistory = [];
    this.stepDetector.reset();
    this.gravityFilter.reset();
    this.magnitudeLpf.reset();
    aiInertialEngine.reset();
    this.notify();
  }

  private pushMotionSample(sample: MotionSample) {
    this.recentMotion.push(sample);
    if (this.recentMotion.length > this.maxMotionSamples) {
      this.recentMotion.shift();
    }
  }

  private recordPathPoint(
    lat: number,
    lng: number,
    timestamp: number,
    mode: TrackingMode,
    heading: number,
    direction: WalkDirection = 'FORWARD',
    accuracy?: number,
    stepIndex?: number
  ) {
    this.pathHistory.push({
      lat,
      lng,
      timestamp,
      mode,
      heading,
      direction,
      accuracy,
      stepIndex,
    });

    if (this.pathHistory.length > this.maxPathPoints) {
      this.pathHistory.shift();
    }
  }
}

// Global Singleton Instance
export const pdrEngine = new PDREngine();
