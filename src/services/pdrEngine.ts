/**
 * Pedestrian Dead Reckoning (PDR) Engine
 * Integrates Accelerometer, Gyroscope, Compass, and Geodesy
 */

import type {
  Coordinates,
  HeadingData,
  MotionSample,
  PathPoint,
  StepMetrics,
  TrackingMode,
  CalibrationConfig,
} from '../types';
import { calculateDestinationPoint, calculateHaversineDistance } from '../utils/geodesy';
import { OrientationInvariantGravityFilter, LowPassFilter, StepDetector } from '../utils/filter';
import { HeadingFusionFilter, computeRotationMatrixHeading, normalizeDegrees } from '../utils/orientation';

export interface PDRState {
  mode: TrackingMode;
  currentLocation: Coordinates;
  headingData: HeadingData;
  stepMetrics: StepMetrics;
  recentMotion: MotionSample[];
  pathHistory: PathPoint[];
  config: CalibrationConfig;
  hasReceivedFix: boolean;
}

export type PDRStateListener = (state: PDRState) => void;

export class PDREngine {
  private mode: TrackingMode = 'SEARCHING_GPS';
  private hasReceivedFix: boolean = false;
  private hasPreciseGpsFix: boolean = false;

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
  };

  private config: CalibrationConfig = {
    weinbergK: 0.45,
    peakThreshold: 0.35, // Sensitive default for realistic human walking
    minStepIntervalMs: 220,
    smoothingFactor: 0.25,
    gyroWeight: 0.94,
  };

  private recentMotion: MotionSample[] = [];
  private readonly maxMotionSamples = 80;
  private pathHistory: PathPoint[] = [];
  private readonly maxPathPoints = 500;

  // Filter instances
  private gravityFilter = new OrientationInvariantGravityFilter();
  private magnitudeLpf = new LowPassFilter(0.25);
  private stepDetector = new StepDetector(0.45, 0.35, 220);
  private headingFusion = new HeadingFusionFilter(0.94);

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
    };
  }

  public setMode(newMode: TrackingMode) {
    this.mode = newMode;
    this.notify();
  }

  public updateCalibration(partialConfig: Partial<CalibrationConfig>) {
    this.config = { ...this.config, ...partialConfig };
    this.stepDetector.updateConfig(
      this.config.weinbergK,
      this.config.peakThreshold,
      this.config.minStepIntervalMs
    );
    this.headingFusion.setGyroWeight(this.config.gyroWeight);
    this.notify();
  }

  /**
   * Called when approximate (e.g. IP) location is found before GPS lock
   */
  public setInitialApproximateLocation(lat: number, lng: number) {
    if (this.hasPreciseGpsFix) return;

    this.currentLocation.latitude = lat;
    this.currentLocation.longitude = lng;
    this.hasReceivedFix = true;
    this.recordPathPoint(lat, lng, Date.now(), 'SEARCHING_GPS', this.headingData.heading, 500);
    this.notify();
  }

  /**
   * Called when live GPS fix is received
   */
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
      this.headingData.heading = heading;
      this.headingFusion.reset(heading);
    }

    if (this.mode === 'GPS' || this.mode === 'SEARCHING_GPS') {
      this.mode = 'GPS';

      // Distance increment if valid previous position
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
        accuracy !== null ? accuracy : undefined
      );
    }

    this.notify();
  }

  /**
   * Updates device orientation from DeviceOrientationEvent, W3C Sensor, or synthetic sources
   */
  public updateOrientation(
    alpha: number | null,
    beta: number | null,
    gamma: number | null,
    webkitCompassHeading?: number,
    absolute: boolean = false
  ) {
    let resolvedHeading = this.headingData.heading;
    let source: HeadingData['source'] = 'fallback';

    if (webkitCompassHeading !== undefined && !isNaN(webkitCompassHeading)) {
      resolvedHeading = normalizeDegrees(webkitCompassHeading);
      source = 'webkit';
    } else if (alpha !== null && beta !== null && gamma !== null) {
      if (absolute) {
        resolvedHeading = computeRotationMatrixHeading(alpha, beta, gamma);
        source = 'absolute';
      } else {
        resolvedHeading = computeRotationMatrixHeading(alpha, beta, gamma);
        source = 'rotation-matrix';
      }
    } else if (alpha !== null && !isNaN(alpha)) {
      resolvedHeading = normalizeDegrees(360 - alpha);
      source = 'alpha';
    }

    this.headingData = {
      heading: resolvedHeading,
      rawHeading: resolvedHeading,
      source,
      pitch: beta ?? 0,
      roll: gamma ?? 0,
      calibrated: true,
    };

    this.notify();
  }

  /**
   * Processes raw accelerometer and gyroscope data from DeviceMotionEvent or Generic Sensor API
   */
  public processDeviceMotion(
    ax: number,
    ay: number,
    az: number,
    gyroZ: number | null,
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

    // Apply low-pass smoothing filter to dynamic acceleration
    const filteredMag = this.magnitudeLpf.filter(dynamicAcc);

    // Fuse gyroscope with current heading
    if (gyroZ !== null && !isNaN(gyroZ)) {
      const fusedHeading = this.headingFusion.update(
        this.headingData.rawHeading,
        gyroZ,
        timestamp
      );
      this.headingData.heading = fusedHeading;
    }

    // Run step detector
    const detection = this.stepDetector.processSample(filteredMag, timestamp);

    const sample: MotionSample = {
      timestamp,
      ax,
      ay,
      az,
      rawMagnitude: Number(rawMag.toFixed(2)),
      filteredMagnitude: Number(filteredMag.toFixed(2)),
      isPeak: detection.isStep,
      stepLength: detection.stepLength,
    };

    this.pushMotionSample(sample);

    // If step detected
    if (detection.isStep) {
      this.handleStepDetected(detection.stepLength, timestamp);
    } else {
      this.notify();
    }
  }

  /**
   * Handles a detected step and performs geodetic translation if in DEAD_RECKONING mode
   */
  public handleStepDetected(stepLength: number, timestamp: number = Date.now()) {
    this.stepMetrics.stepCount += 1;
    this.stepMetrics.lastStepTimestamp = timestamp;
    this.stepMetrics.currentStepLength = stepLength;
    this.stepMetrics.totalDistance += stepLength;

    // Track cadence (steps in past 10 seconds)
    this.stepTimestamps.push(timestamp);
    const tenSecondsAgo = timestamp - 10000;
    this.stepTimestamps = this.stepTimestamps.filter((t) => t >= tenSecondsAgo);
    const cadence = (this.stepTimestamps.length / 10) * 60;
    this.stepMetrics.cadence = Number(cadence.toFixed(1));

    // Calculate speed based on cadence & step length
    const speedMps = (cadence / 60) * stepLength;
    this.stepMetrics.speedMps = Number(speedMps.toFixed(2));
    this.stepMetrics.speedKmh = Number((speedMps * 3.6).toFixed(2));

    // If in Dead Reckoning mode OR SEARCHING_GPS mode, advance the geodetic coordinates
    if (this.mode === 'DEAD_RECKONING' || this.mode === 'SEARCHING_GPS') {
      const { lat: newLat, lng: newLng } = calculateDestinationPoint(
        this.currentLocation.latitude,
        this.currentLocation.longitude,
        stepLength,
        this.headingData.heading
      );

      this.currentLocation = {
        ...this.currentLocation,
        latitude: newLat,
        longitude: newLng,
        speed: speedMps,
        heading: this.headingData.heading,
        accuracy: Math.min(50, (this.currentLocation.accuracy ?? 10) + 0.2),
      };

      this.recordPathPoint(
        newLat,
        newLng,
        timestamp,
        'DEAD_RECKONING',
        this.headingData.heading,
        this.currentLocation.accuracy ?? undefined,
        this.stepMetrics.stepCount
      );
    }

    this.notify();
  }

  /**
   * Injects a synthetic step for testing in browser environments
   */
  public injectSimulatedStep(stepLength: number = 0.72) {
    const now = Date.now();
    const simAx = (Math.random() - 0.5) * 0.4;
    const simAy = 2.4 + (Math.random() - 0.5) * 0.3;
    const simAz = 9.81 + 1.8;
    this.processDeviceMotion(simAx, simAy, simAz, 0, true, now);
    this.handleStepDetected(stepLength, now);
  }

  public setManualHeading(heading: number) {
    this.headingData = {
      ...this.headingData,
      heading: normalizeDegrees(heading),
      rawHeading: normalizeDegrees(heading),
      source: 'simulated',
    };
    this.headingFusion.reset(heading);
    this.notify();
  }

  public setManualLocation(lat: number, lng: number) {
    this.hasReceivedFix = true;
    this.currentLocation = {
      ...this.currentLocation,
      latitude: lat,
      longitude: lng,
    };
    this.recordPathPoint(lat, lng, Date.now(), this.mode, this.headingData.heading, 5);
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
    };
    this.stepTimestamps = [];
    this.pathHistory = [];
    this.stepDetector.reset();
    this.gravityFilter.reset();
    this.magnitudeLpf.reset();
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
    accuracy?: number,
    stepIndex?: number
  ) {
    this.pathHistory.push({
      lat,
      lng,
      timestamp,
      mode,
      heading,
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
