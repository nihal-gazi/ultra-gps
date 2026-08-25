/**
 * Sensor signal processing, orientation-invariant gravity extraction,
 * sensitive step detection, and forward/backward progression tracking.
 */

import type { WalkDirection } from '../types';

export class LowPassFilter {
  private alpha: number;
  private prevValue: number | null = null;

  constructor(alpha: number = 0.35) {
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
 * Uses a slow running average (alpha = 0.992, ~3s time constant) to extract true DC gravity
 * without absorbing the 1-3 Hz dynamic human walking waves.
 */
export class OrientationInvariantGravityFilter {
  private gravityNorm: number = 9.81;
  private readonly alpha: number = 0.992;

  public process(
    ax: number,
    ay: number,
    az: number
  ): { rawNorm: number; dynamicAcc: number } {
    const rawNorm = Math.sqrt(ax * ax + ay * ay + az * az);

    // Ultra-slow tracking so gravity doesn't follow walking strides
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
  variance: number;
  isStationary: boolean;
  detectedDirection: WalkDirection;
}

export class StepDetector {
  private windowSize: number;
  private magBuffer: number[] = [];
  private forwardBuffer: number[] = [];
  private timestamps: number[] = [];
  private lastStepTimestamp: number = 0;
  private minStepIntervalMs: number;
  private peakThreshold: number;
  private weinbergK: number;
  private stationaryVarianceThreshold: number;

  constructor(
    weinbergK: number = 0.45,
    peakThreshold: number = 0.25, // Highly sensitive for natural indoor/outdoor walking
    minStepIntervalMs: number = 200,
    stationaryVarianceThreshold: number = 0.02, // Gentle stationary gate
    windowSize: number = 9
  ) {
    this.weinbergK = weinbergK;
    this.peakThreshold = peakThreshold;
    this.minStepIntervalMs = minStepIntervalMs;
    this.stationaryVarianceThreshold = stationaryVarianceThreshold;
    this.windowSize = windowSize;
  }

  public updateConfig(
    weinbergK?: number,
    peakThreshold?: number,
    minStepIntervalMs?: number,
    stationaryVarianceThreshold?: number
  ) {
    if (weinbergK !== undefined) this.weinbergK = weinbergK;
    if (peakThreshold !== undefined) this.peakThreshold = peakThreshold;
    if (minStepIntervalMs !== undefined) this.minStepIntervalMs = minStepIntervalMs;
    if (stationaryVarianceThreshold !== undefined) {
      this.stationaryVarianceThreshold = stationaryVarianceThreshold;
    }
  }

  private computeVariance(samples: number[]): number {
    if (samples.length < 3) return 0;
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const sqDiffs = samples.reduce((a, b) => a + Math.pow(b - mean, 2), 0);
    return sqDiffs / samples.length;
  }

  /**
   * Evaluates dynamic acceleration sample and triggers steps
   */
  public processSample(
    magnitude: number,
    forwardAcc: number,
    timestamp: number
  ): StepDetectionResult {
    this.magBuffer.push(magnitude);
    this.forwardBuffer.push(forwardAcc);
    this.timestamps.push(timestamp);

    if (this.magBuffer.length > this.windowSize) {
      this.magBuffer.shift();
      this.forwardBuffer.shift();
      this.timestamps.shift();
    }

    if (this.magBuffer.length < this.windowSize) {
      return {
        isStep: false,
        stepLength: 0,
        peakValue: 0,
        valleyValue: 0,
        variance: 0,
        isStationary: false,
        detectedDirection: 'FORWARD',
      };
    }

    // 1. Kinetic Variance
    const variance = this.computeVariance(this.magBuffer);
    const isStationary = variance < this.stationaryVarianceThreshold;

    const midIdx = Math.floor(this.windowSize / 2);
    const candidatePeak = this.magBuffer[midIdx];
    const candidateTimestamp = this.timestamps[midIdx];

    // 2. Local Peak Check
    let isLocalPeak = true;
    for (let i = 0; i < this.magBuffer.length; i++) {
      if (i !== midIdx && this.magBuffer[i] > candidatePeak) {
        isLocalPeak = false;
        break;
      }
    }

    if (!isLocalPeak) {
      return {
        isStep: false,
        stepLength: 0,
        peakValue: candidatePeak,
        valleyValue: 0,
        variance,
        isStationary,
        detectedDirection: 'FORWARD',
      };
    }

    // 3. Minimum Step Interval & Threshold Check
    const timeSinceLastStep = candidateTimestamp - this.lastStepTimestamp;
    if (candidatePeak < this.peakThreshold || timeSinceLastStep < this.minStepIntervalMs) {
      return {
        isStep: false,
        stepLength: 0,
        peakValue: candidatePeak,
        valleyValue: 0,
        variance,
        isStationary,
        detectedDirection: 'FORWARD',
      };
    }

    // 4. Amplitude Range
    let minAcc = this.magBuffer[0];
    let maxAcc = this.magBuffer[0];
    for (let i = 0; i < this.magBuffer.length; i++) {
      if (this.magBuffer[i] < minAcc) minAcc = this.magBuffer[i];
      if (this.magBuffer[i] > maxAcc) maxAcc = this.magBuffer[i];
    }

    const deltaAcc = Math.max(0.1, maxAcc - minAcc);
    if (deltaAcc < 0.15) {
      return {
        isStep: false,
        stepLength: 0,
        peakValue: candidatePeak,
        valleyValue: minAcc,
        variance,
        isStationary,
        detectedDirection: 'FORWARD',
      };
    }

    // 5. Weinberg Step Length: SL = K * (a_max - a_min)^(1/4)
    let stepLength = this.weinbergK * Math.pow(deltaAcc, 0.25);
    stepLength = Math.max(0.35, Math.min(1.20, stepLength));

    // 6. Forward vs Backward Direction
    let forwardSurge = 0;
    for (let i = 0; i <= midIdx; i++) {
      forwardSurge += this.forwardBuffer[i];
    }
    const detectedDirection: WalkDirection = forwardSurge < -0.15 ? 'BACKWARD' : 'FORWARD';

    this.lastStepTimestamp = candidateTimestamp;

    return {
      isStep: true,
      stepLength: Number(stepLength.toFixed(3)),
      peakValue: candidatePeak,
      valleyValue: minAcc,
      variance,
      isStationary: false,
      detectedDirection,
    };
  }

  public reset() {
    this.magBuffer = [];
    this.forwardBuffer = [];
    this.timestamps = [];
    this.lastStepTimestamp = 0;
  }
}
