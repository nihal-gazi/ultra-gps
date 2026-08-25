/**
 * Device orientation parsing, compass heading calculation, and gyro-compass complementary fusion.
 */

import { degreesToRadians, radiansToDegrees } from './geodesy';

export function normalizeDegrees(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/**
 * Calculates shortest angular difference from angle1 to angle2 in range [-180, 180]
 */
export function angularDifference(targetDeg: number, sourceDeg: number): number {
  return ((targetDeg - sourceDeg + 540) % 360) - 180;
}

/**
 * Computes compass heading from Euler angles (alpha, beta, gamma) using 3D rotation matrix
 */
export function computeRotationMatrixHeading(
  alpha: number,
  beta: number,
  gamma: number
): number {
  const a = degreesToRadians(alpha);
  const b = degreesToRadians(beta);
  const g = degreesToRadians(gamma);

  const cA = Math.cos(a);
  const sA = Math.sin(a);
  const sB = Math.sin(b);
  const cG = Math.cos(g);
  const sG = Math.sin(g);

  // Calculate the rotation matrix components pointing towards the Earth's horizontal plane
  const rA = -cA * sG - sA * sB * cG;
  const rB = -sA * sG + cA * sB * cG;

  let heading = radiansToDegrees(Math.atan2(rA, rB));
  if (heading < 0) {
    heading += 360;
  }

  return normalizeDegrees(heading);
}

export class HeadingFusionFilter {
  private currentHeading: number = 0;
  private lastTimestamp: number = 0;
  private gyroWeight: number; // typically 0.92 - 0.98

  constructor(gyroWeight: number = 0.94) {
    this.gyroWeight = gyroWeight;
  }

  public setGyroWeight(weight: number) {
    this.gyroWeight = Math.max(0, Math.min(1, weight));
  }

  public reset(initialHeading: number = 0) {
    this.currentHeading = normalizeDegrees(initialHeading);
    this.lastTimestamp = 0;
  }

  /**
   * Fuses gyroscope angular velocity with compass heading reading.
   * @param compassHeading Raw or tilt-compensated compass heading in degrees (0 - 360)
   * @param gyroRateZ Angular velocity around Z axis (deg/sec) from DeviceMotionEvent.rotationRate
   * @param timestamp Current timestamp in ms
   */
  public update(
    compassHeading: number,
    gyroRateZ: number | null,
    timestamp: number
  ): number {
    if (this.lastTimestamp === 0) {
      this.currentHeading = normalizeDegrees(compassHeading);
      this.lastTimestamp = timestamp;
      return this.currentHeading;
    }

    const dt = Math.max(0.001, Math.min(0.5, (timestamp - this.lastTimestamp) / 1000));
    this.lastTimestamp = timestamp;

    let predictedHeading = this.currentHeading;
    if (gyroRateZ !== null && !isNaN(gyroRateZ)) {
      predictedHeading = normalizeDegrees(this.currentHeading + gyroRateZ * dt);
    }

    // Compute angular error between compass measurement and predicted heading
    const error = angularDifference(compassHeading, predictedHeading);

    // Complementary filter update
    const fusedHeading = normalizeDegrees(predictedHeading + (1 - this.gyroWeight) * error);
    this.currentHeading = fusedHeading;

    return this.currentHeading;
  }

  public getHeading(): number {
    return this.currentHeading;
  }
}
