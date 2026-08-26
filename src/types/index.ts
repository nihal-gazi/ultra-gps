export type TrackingMode = 'GPS' | 'AI_TRANSFORMER' | 'SEARCHING_GPS';

export interface Coordinates {
  latitude: number;
  longitude: number;
  altitude?: number | null;
  accuracy?: number | null;
  speed?: number | null;
  heading?: number | null;
}

export interface HeadingData {
  heading: number; // 0 - 360 degrees clockwise from North
  rawHeading: number;
  source: 'webkit' | 'absolute' | 'rotation-matrix' | 'alpha' | 'simulated' | 'fallback';
  pitch: number; // Beta (-180 to 180)
  roll: number; // Gamma (-90 to 90)
  calibrated: boolean;
}

export interface MotionSample {
  timestamp: number;
  // Raw 6-DOF IMU
  rawAx: number;
  rawAy: number;
  rawAz: number;
  rawGx: number;
  rawGy: number;
  rawGz: number;
  // Gaussian Smoothed 6-DOF IMU
  ax: number;
  ay: number;
  az: number;
  gx: number;
  gy: number;
  gz: number;
  rawMagnitude: number;
  filteredMagnitude: number;
  gyroMagnitude: number;
}

export interface NavigationMetrics {
  totalDistanceMeters: number;
  currentSpeedMps: number;
  currentSpeedKmh: number;
  lastDisplacementMeters: number;
  totalInferenceUpdates: number;
  lastUpdateTimestamp: number;
}

export interface AIInferenceMetrics {
  isLoaded: boolean;
  isLoading: boolean;
  executionProvider: 'webgpu' | 'wasm' | 'cpu' | 'initializing' | 'failed';
  lastLatencyMs: number;
  avgLatencyMs: number;
  totalInferences: number;
  lastDisplacement: { dx: number; dy: number; magnitude: number };
  // Instantaneous kinematic values directly from latest inference
  instantaneousSpeedMps: number;
  instantaneousSpeedKmh: number;
  instantaneousTurnDeltaDeg: number;
  modelName: string;
  errorMessage?: string;
}

export interface PathPoint {
  lat: number;
  lng: number;
  timestamp: number;
  mode: TrackingMode;
  heading: number;
  accuracy?: number;
  displacement?: number;
}

export interface GaussianConfig {
  kernelSize: number; // Gaussian window size (e.g. 7)
  sigma: number; // Gaussian standard deviation (e.g. 1.2)
}

export interface SensorStatus {
  gpsAvailable: boolean;
  gpsActive: boolean;
  gpsStatusText: string;
  hasInitialFix: boolean;
  gyroAvailable: boolean;
  accelAvailable: boolean;
  hasHardwareMotion: boolean;
  motionEventCount: number;
  permissionGranted: boolean;
  isSimulating: boolean;
}
