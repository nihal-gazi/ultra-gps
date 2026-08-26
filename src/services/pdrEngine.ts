/**
 * Neural Inertial Tracking Engine.
 * 
 * Implements the streamlined 5-step non-GPS tracking pipeline:
 * 1. Sensor data is recorded (Accelerometer, Gyroscope, Heading)
 * 2. Sensor data is smoothened using Gaussian filtering
 * 3. Data is displayed via state subscribers
 * 4. Data is passed through ONNX Transformer
 * 5. Output displacement is plotted onto the map
 */

import type {
  Coordinates,
  HeadingData,
  MotionSample,
  PathPoint,
  NavigationMetrics,
  TrackingMode,
} from '../types';
import { calculateDestinationPoint, calculateHaversineDistance } from '../utils/geodesy';
import { computeRobustCompassHeading, normalizeDegrees } from '../utils/orientation';
import { aiInertialEngine } from './aiInertialEngine';

export interface TrackerState {
  mode: TrackingMode;
  currentLocation: Coordinates;
  headingData: HeadingData;
  navigationMetrics: NavigationMetrics;
  recentMotion: MotionSample[];
  pathHistory: PathPoint[];
  hasReceivedFix: boolean;
}

export type TrackerStateListener = (state: TrackerState) => void;

export class TrackerEngine {
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

  private navigationMetrics: NavigationMetrics = {
    totalDistanceMeters: 0,
    currentSpeedMps: 0,
    currentSpeedKmh: 0,
    lastDisplacementMeters: 0,
    totalInferenceUpdates: 0,
    lastUpdateTimestamp: 0,
  };

  private recentMotion: MotionSample[] = [];
  private readonly maxMotionSamples = 80;
  private pathHistory: PathPoint[] = [];
  private readonly maxPathPoints = 800;

  private listeners: Set<TrackerStateListener> = new Set();

  constructor(initialLocation?: { lat: number; lng: number }) {
    if (initialLocation) {
      this.currentLocation.latitude = initialLocation.lat;
      this.currentLocation.longitude = initialLocation.lng;
    }
  }

  public subscribe(listener: TrackerStateListener): () => void {
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

  public getState(): TrackerState {
    return {
      mode: this.mode,
      currentLocation: { ...this.currentLocation },
      headingData: { ...this.headingData },
      navigationMetrics: { ...this.navigationMetrics },
      recentMotion: [...this.recentMotion],
      pathHistory: [...this.pathHistory],
      hasReceivedFix: this.hasReceivedFix,
    };
  }

  public setMode(newMode: TrackingMode) {
    this.mode = newMode;
    this.notify();
  }

  public setInitialApproximateLocation(lat: number, lng: number) {
    if (this.hasPreciseGpsFix) return;

    this.currentLocation.latitude = lat;
    this.currentLocation.longitude = lng;
    this.hasReceivedFix = true;
    this.recordPathPoint(lat, lng, Date.now(), 'SEARCHING_GPS', this.headingData.heading, 500);
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
      this.headingData.heading = heading;
    }

    if (this.mode === 'GPS' || this.mode === 'SEARCHING_GPS') {
      this.mode = 'GPS';

      if (this.pathHistory.length > 0) {
        const d = calculateHaversineDistance(prevLat, prevLng, lat, lng);
        if (d > 1 && d < 100) {
          this.navigationMetrics.totalDistanceMeters += d;
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

    this.headingData = {
      heading: Number(rawHeading.toFixed(1)),
      rawHeading: Number(rawHeading.toFixed(1)),
      source,
      pitch: Number((beta ?? 0).toFixed(1)),
      roll: Number((gamma ?? 0).toFixed(1)),
      calibrated: true,
    };

    this.notify();
  }

  /**
   * Pure 5-Step Non-GPS Execution:
   * 1. Record 6-DOF sensor sample
   * 2. Gaussian smoothing of channels
   * 3. Display data on HUD / Waveform
   * 4. Feed to ONNX Transformer
   * 5. Plot ONNX output displacement
   */
  public processDeviceMotion(
    ax: number,
    ay: number,
    az: number,
    gx: number = 0,
    gy: number = 0,
    gz: number = 0,
    timestamp: number = Date.now()
  ) {
    const rawMag = Math.sqrt(ax * ax + ay * ay + az * az);

    // Steps 1, 2, 4: Record, Gaussian Smooth, and Pass into ONNX
    const smoothed = aiInertialEngine.processSensorSample(
      ax,
      ay,
      az,
      gx,
      gy,
      gz,
      timestamp,
      (displacementMeters, speedMps, _headingDeltaDeg) => {
        // Step 5: Plot ONNX displacement output onto the map
        this.handleOnnxOdometryUpdate(displacementMeters, speedMps, timestamp);
      }
    );

    // Step 3: Record sample for live HUD waveform display
    const sample: MotionSample = {
      timestamp,
      rawAx: Number(ax.toFixed(2)),
      rawAy: Number(ay.toFixed(2)),
      rawAz: Number(az.toFixed(2)),
      rawGx: Number(gx.toFixed(1)),
      rawGy: Number(gy.toFixed(1)),
      rawGz: Number(gz.toFixed(1)),
      ax: Number(smoothed.smoothedAx.toFixed(2)),
      ay: Number(smoothed.smoothedAy.toFixed(2)),
      az: Number(smoothed.smoothedAz.toFixed(2)),
      gx: Number(smoothed.smoothedGx.toFixed(1)),
      gy: Number(smoothed.smoothedGy.toFixed(1)),
      gz: Number(smoothed.smoothedGz.toFixed(1)),
      rawMagnitude: Number(rawMag.toFixed(2)),
      filteredMagnitude: Number(smoothed.accelMagnitude.toFixed(2)),
      gyroMagnitude: Number(smoothed.gyroMagnitude.toFixed(1)),
    };

    this.pushMotionSample(sample);
    this.notify();
  }

  /**
   * Step 5: Plot ONNX odometry output displacement onto map
   */
  private handleOnnxOdometryUpdate(displacementMeters: number, speedMps: number, timestamp: number) {
    if (displacementMeters <= 0.001) {
      this.navigationMetrics.currentSpeedMps = 0;
      this.navigationMetrics.currentSpeedKmh = 0;
      this.navigationMetrics.lastDisplacementMeters = 0;
      this.notify();
      return;
    }

    this.navigationMetrics.lastDisplacementMeters = Number(displacementMeters.toFixed(3));
    this.navigationMetrics.totalDistanceMeters += displacementMeters;
    this.navigationMetrics.currentSpeedMps = speedMps;
    this.navigationMetrics.currentSpeedKmh = Number((speedMps * 3.6).toFixed(1));
    this.navigationMetrics.totalInferenceUpdates += 1;
    this.navigationMetrics.lastUpdateTimestamp = timestamp;

    if (this.mode === 'AI_TRANSFORMER' || this.mode === 'SEARCHING_GPS') {
      const { lat: newLat, lng: newLng } = calculateDestinationPoint(
        this.currentLocation.latitude,
        this.currentLocation.longitude,
        displacementMeters,
        this.headingData.heading
      );

      this.currentLocation = {
        ...this.currentLocation,
        latitude: newLat,
        longitude: newLng,
        speed: speedMps,
        heading: this.headingData.heading,
        accuracy: Math.min(30, (this.currentLocation.accuracy ?? 8) + 0.05),
      };

      this.recordPathPoint(
        newLat,
        newLng,
        timestamp,
        'AI_TRANSFORMER',
        this.headingData.heading,
        this.currentLocation.accuracy ?? undefined,
        displacementMeters
      );
    }

    this.notify();
  }

  public injectSimulatedSample(ax: number = 0.5, ay: number = 1.8, az: number = 9.81, gx: number = 5.0, gy: number = 2.0, gz: number = 1.0) {
    this.processDeviceMotion(ax, ay, az, gx, gy, gz, Date.now());
  }

  public setManualHeading(heading: number) {
    const norm = normalizeDegrees(heading);
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
    this.recordPathPoint(lat, lng, Date.now(), this.mode, this.headingData.heading, 5);
    this.notify();
  }

  public resetTracking() {
    this.navigationMetrics = {
      totalDistanceMeters: 0,
      currentSpeedMps: 0,
      currentSpeedKmh: 0,
      lastDisplacementMeters: 0,
      totalInferenceUpdates: 0,
      lastUpdateTimestamp: 0,
    };
    this.pathHistory = [];
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
    accuracy?: number,
    displacement?: number
  ) {
    this.pathHistory.push({
      lat,
      lng,
      timestamp,
      mode,
      heading,
      accuracy,
      displacement,
    });

    if (this.pathHistory.length > this.maxPathPoints) {
      this.pathHistory.shift();
    }
  }
}

// Global Singleton Instance
export const pdrEngine = new TrackerEngine();
