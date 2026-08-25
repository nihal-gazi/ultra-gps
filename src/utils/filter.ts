/**
 * Sensor signal processing, digital filtering, orientation-invariant gravity extraction, and step detection
 */

export class LowPassFilter {
  private alpha: number;
  private prevValue: number | null = null;

  constructor(alpha: number = 0.25) {
    this.alpha = Math.max(0, Math.min(1, alpha));
  }

  public filter(val: number): number {
    if (this.prevValue === null) {
      this.prevValue = val;
      return val;
    }
    const filtered = this.alpha * val + (1 - this.alpha) * this.prevValue;
    this.prevValue = filtered;
    return filtered;
  }

  public reset(initialValue?: number) {
    this.prevValue = initialValue ?? null;
  }
}

/**
 * Orientation-Invariant Gravity Filter
 * Uses the Euclidean norm of the 3D acceleration vector so step detection works
 * accurately whether the phone is flat, upright, in pocket, or tilted at any angle.
 */
export class OrientationInvariantGravityFilter {
  private gravityNorm: number = 9.81;
  private readonly alpha: number = 0.92; // Slow running average for gravity DC

  public process(
    ax: number,
    ay: number,
    az: number
  ): { rawNorm: number; dynamicAcc: number } {
    const rawNorm = Math.sqrt(ax * ax + ay * ay + az * az);

    // Update running gravity norm
    this.gravityNorm = this.alpha * this.gravityNorm + (1 - this.alpha) * rawNorm;

    // Dynamic linear acceleration caused by pedestrian motion
    const dynamicAcc = Math.abs(rawNorm - this.gravityNorm);

    return { rawNorm, dynamicAcc };
  }

  public reset() {
    this.gravityNorm = 9.81;
  }
}

export interface StepDetectionResult {
  isStep: boolean;
  stepLength: number;
  peakValue: number;
  valleyValue: number;
}

export class StepDetector {
  private windowSize: number;
  private buffer: number[] = [];
  private timestamps: number[] = [];
  private lastStepTimestamp: number = 0;
  private minStepIntervalMs: number;
  private peakThreshold: number;
  private weinbergK: number;

  constructor(
    weinbergK: number = 0.45,
    peakThreshold: number = 0.35, // Sensitive default for realistic pedestrian walking
    minStepIntervalMs: number = 220,
    windowSize: number = 9
  ) {
    this.weinbergK = weinbergK;
    this.peakThreshold = peakThreshold;
    this.minStepIntervalMs = minStepIntervalMs;
    this.windowSize = windowSize;
  }

  public updateConfig(
    weinbergK?: number,
    peakThreshold?: number,
    minStepIntervalMs?: number
  ) {
    if (weinbergK !== undefined) this.weinbergK = weinbergK;
    if (peakThreshold !== undefined) this.peakThreshold = peakThreshold;
    if (minStepIntervalMs !== undefined) this.minStepIntervalMs = minStepIntervalMs;
  }

  /**
   * Processes a single filtered dynamic acceleration sample and detects steps
   */
  public processSample(
    magnitude: number,
    timestamp: number
  ): StepDetectionResult {
    this.buffer.push(magnitude);
    this.timestamps.push(timestamp);

    if (this.buffer.length > this.windowSize) {
      this.buffer.shift();
      this.timestamps.shift();
    }

    if (this.buffer.length < this.windowSize) {
      return { isStep: false, stepLength: 0, peakValue: 0, valleyValue: 0 };
    }

    const midIdx = Math.floor(this.windowSize / 2);
    const candidatePeak = this.buffer[midIdx];
    const candidateTimestamp = this.timestamps[midIdx];

    // Check if middle element is a local peak
    let isLocalPeak = true;
    for (let i = 0; i < this.buffer.length; i++) {
      if (i !== midIdx && this.buffer[i] > candidatePeak) {
        isLocalPeak = false;
        break;
      }
    }

    if (!isLocalPeak) {
      return { isStep: false, stepLength: 0, peakValue: 0, valleyValue: 0 };
    }

    // Check threshold and minimum step interval to avoid double-bouncing
    const timeSinceLastStep = candidateTimestamp - this.lastStepTimestamp;
    if (candidatePeak < this.peakThreshold || timeSinceLastStep < this.minStepIntervalMs) {
      return { isStep: false, stepLength: 0, peakValue: candidatePeak, valleyValue: 0 };
    }

    // Find min acceleration in the current buffer window (gait valley)
    let minAcc = this.buffer[0];
    let maxAcc = this.buffer[0];
    for (let i = 0; i < this.buffer.length; i++) {
      if (this.buffer[i] < minAcc) minAcc = this.buffer[i];
      if (this.buffer[i] > maxAcc) maxAcc = this.buffer[i];
    }

    const deltaAcc = Math.max(0.05, maxAcc - minAcc);

    // Weinberg Step Length Model: SL = K * (a_max - a_min)^(1/4)
    let stepLength = this.weinbergK * Math.pow(deltaAcc, 0.25);

    // Clamp step length to human bounds (0.35m - 1.20m)
    stepLength = Math.max(0.35, Math.min(1.20, stepLength));

    this.lastStepTimestamp = candidateTimestamp;

    return {
      isStep: true,
      stepLength: Number(stepLength.toFixed(3)),
      peakValue: candidatePeak,
      valleyValue: minAcc,
    };
  }

  public reset() {
    this.buffer = [];
    this.timestamps = [];
    this.lastStepTimestamp = 0;
  }
}
