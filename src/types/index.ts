export type TrackingMode = 'GPS' | 'DEAD_RECKONING' | 'AI_TRANSFORMER' | 'SEARCHING_GPS' | 'CALIBRATING';
export type WalkDirection = 'FORWARD' | 'BACKWARD';

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
  ax: number;
  ay: number;
  az: number;
  rawMagnitude: number;
  filteredMagnitude: number;
  isPeak: boolean;
  stepLength: number;
  isStationary: boolean;
  gx: number; // Gyro rotation rate X (deg/s)
  gy: number; // Gyro rotation rate Y (deg/s)
  gz: number; // Gyro rotation rate Z (deg/s)
  gyroMagnitude: number; // Combined angular velocity magnitude (deg/s)
}

export interface StepMetrics {
  stepCount: number;
  lastStepTimestamp: number;
  cadence: number; // steps per minute
  currentStepLength: number; // in meters
  totalDistance: number; // in meters
  speedMps: number; // meters per second
  speedKmh: number; // km/h
  isStationary: boolean;
  motionVariance: number;
  walkDirection: WalkDirection;
  directionMode: 'AUTO' | 'FORWARD' | 'BACKWARD';
  aiDisplacementMeters?: number;
  aiHeadingDeltaDeg?: number;
}

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

export interface PathPoint {
  lat: number;
  lng: number;
  timestamp: number;
  mode: TrackingMode;
  heading: number;
  direction?: WalkDirection;
  accuracy?: number;
  stepIndex?: number;
}

export interface CalibrationConfig {
  weinbergK: number; // Weinberg constant K (typically 0.40 - 0.55)
  peakThreshold: number; // Acceleration threshold (m/s^2) for peak detection
  minStepIntervalMs: number; // Minimum ms between consecutive steps (e.g. 250ms -> max 4 steps/sec)
  smoothingFactor: number; // Low pass filter factor alpha (0 - 1)
  gyroWeight: number; // Gyroscope fusion weight in complementary filter (0.90 - 0.98)
  stationaryVarianceThreshold: number; // Minimum variance below which device is stationary (ZUPT)
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
