/**
 * Sensor signal processing, orientation-invariant gravity extraction,
 * ZUPT (Zero Velocity Update) anti-drift stationary gating, and forward/backward step detection.
 */

import type { WalkDirection } from '../types';

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
 * Uses Euclidean norm of 3D acceleration so step detection works
 * accurately whether the phone is flat, upright, or tilted in pocket.
 */
export class OrientationInvariantGravityFilter {
  private gravityNorm: number = 9.81;
  private readonly alpha: number = 0.92;

  public process(
    ax: number,
    ay: number,
    az: number
  ): { rawNorm: number; dynamicAcc: number } {
    const rawNorm = Math.sqrt(ax * ax + ay * ay + az * az);

    // Update running gravity norm baseline
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
  private forwardBuffer: number[] = []; // ay longitudinal buffer
  private timestamps: number[] = [];
  private lastStepTimestamp: number = 0;
  private minStepIntervalMs: number;
  private peakThreshold: number;
  private weinbergK: number;
  private stationaryVarianceThreshold: number;

  constructor(
    weinbergK: number = 0.45,
    peakThreshold: number = 0.42,
    minStepIntervalMs: number = 240,
    stationaryVarianceThreshold: number = 0.18,
    windowSize: number = 11
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

  /**
   * Computes statistical variance of acceleration magnitude in recent window
   */
  private computeVariance(samples: number[]): number {
    if (samples.length < 3) return 0;
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const sqDiffs = samples.reduce((a, b) => a + Math.pow(b - mean, 2), 0);
    return sqDiffs / samples.length;
  }

  /**
   * Processes a dynamic acceleration sample and evaluates gait and direction
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
        isStationary: true,
        detectedDirection: 'FORWARD',
      };
    }

    // 1. Compute kinetic variance in window (Zero Velocity Update gate)
    const variance = this.computeVariance(this.magBuffer);
    const isStationary = variance < this.stationaryVarianceThreshold;

    // If stationary, suppress all peak detection to eliminate standing drift
    if (isStationary) {
      return {
        isStep: false,
        stepLength: 0,
        peakValue: 0,
        valleyValue: 0,
        variance,
        isStationary: true,
        detectedDirection: 'FORWARD',
      };
    }

    const midIdx = Math.floor(this.windowSize / 2);
    const candidatePeak = this.magBuffer[midIdx];
    const candidateTimestamp = this.timestamps[midIdx];

    // 2. Local Peak Test
    let isLocalPeak = true;
    for (let i = 0; i < this.magBuffer.length; i++) {
      if (i !== midIdx && this.magBuffer[i] >= candidatePeak) {
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
        isStationary: false,
        detectedDirection: 'FORWARD',
      };
    }

    // 3. Minimum Step Interval Test
    const timeSinceLastStep = candidateTimestamp - this.lastStepTimestamp;
    if (candidatePeak < this.peakThreshold || timeSinceLastStep < this.minStepIntervalMs) {
      return {
        isStep: false,
        stepLength: 0,
        peakValue: candidatePeak,
        valleyValue: 0,
        variance,
        isStationary: false,
        detectedDirection: 'FORWARD',
      };
    }

    // 4. Peak-to-Peak Amplitude Test (rejects low-energy tremors)
    let minAcc = this.magBuffer[0];
    let maxAcc = this.magBuffer[0];
    for (let i = 0; i < this.magBuffer.length; i++) {
      if (this.magBuffer[i] < minAcc) minAcc = this.magBuffer[i];
      if (this.magBuffer[i] > maxAcc) maxAcc = this.magBuffer[i];
    }

    const deltaAcc = maxAcc - minAcc;
    // Human walking requires significant strike-to-swing delta (>= 0.45 m/s²)
    if (deltaAcc < 0.45) {
      return {
        isStep: false,
        stepLength: 0,
        peakValue: candidatePeak,
        valleyValue: minAcc,
        variance,
        isStationary: false,
        detectedDirection: 'FORWARD',
      };
    }

    // 5. Weinberg Step Length Formula: SL = K * (a_max - a_min)^(1/4)
    let stepLength = this.weinbergK * Math.pow(deltaAcc, 0.25);
    stepLength = Math.max(0.35, Math.min(1.20, stepLength));

    // 6. Forward vs Backward Stride Direction Detection
    // Analyze longitudinal acceleration during the foot push-off phase (prior to midIdx)
    let forwardSurge = 0;
    for (let i = 0; i <= midIdx; i++) {
      forwardSurge += this.forwardBuffer[i];
    }
    const detectedDirection: WalkDirection = forwardSurge < -0.6 ? 'BACKWARD' : 'FORWARD';

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
