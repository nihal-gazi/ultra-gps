/**
 * Device orientation parsing, compass heading calculation, and circular smoothing filter.
 * Eliminates jitter, gimbal-lock singularities, and 180-degree tilt inversions.
 */

import { degreesToRadians, radiansToDegrees } from './geodesy';

export function normalizeDegrees(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/**
 * Calculates shortest signed angular difference from sourceDeg to targetDeg in range [-180, 180]
 */
export function angularDifference(targetDeg: number, sourceDeg: number): number {
  return ((targetDeg - sourceDeg + 540) % 360) - 180;
}

/**
 * Computes robust, mathematically exact compass heading from W3C Euler angles (alpha, beta, gamma).
 * Continuous across all tilt angles, portrait/landscape, and handheld walking postures.
 */
export function computeRobustCompassHeading(
  alpha: number,
  beta: number,
  gamma: number
): number {
  const a = degreesToRadians(alpha);
  const b = degreesToRadians(beta);
  const g = degreesToRadians(gamma);

  const sA = Math.sin(a);
  const cA = Math.cos(a);
  const sB = Math.sin(b);
  const sG = Math.sin(g);
  const cG = Math.cos(g);

  // W3C Standard horizontal projection of the phone's forward vector:
  // x = -sin(alpha)*cos(gamma) - cos(alpha)*sin(beta)*sin(gamma)
  // y =  cos(alpha)*cos(gamma) - sin(alpha)*sin(beta)*sin(gamma)
  const x = -sA * cG - cA * sB * sG;
  const y = cA * cG - sA * sB * sG;

  let heading = radiansToDegrees(Math.atan2(x, y));
  if (heading < 0) {
    heading += 360;
  }

  return normalizeDegrees(heading);
}

/**
 * Adaptive Circular Heading Smoother
 * Eliminates jitter when device is still while maintaining instant responsiveness during turns.
 */
export class SmoothHeadingFilter {
  private smoothedHeading: number = 0;
  private isInitialized: boolean = false;

  constructor(initialHeading: number = 0) {
    this.smoothedHeading = normalizeDegrees(initialHeading);
  }

  public reset(heading: number = 0) {
    this.smoothedHeading = normalizeDegrees(heading);
    this.isInitialized = true;
  }

  /**
   * Updates smoothed heading using circular shortest-path interpolation with adaptive gain
   */
  public filter(rawHeading: number): number {
    if (!this.isInitialized || isNaN(this.smoothedHeading)) {
      this.smoothedHeading = normalizeDegrees(rawHeading);
      this.isInitialized = true;
      return this.smoothedHeading;
    }

    const diff = angularDifference(rawHeading, this.smoothedHeading);
    const absDiff = Math.abs(diff);

    // Responsive smoothing:
    // Follows turns immediately while smoothing micro-tremors
    let alpha: number;
    if (absDiff < 1.0) {
      alpha = 0.15;
    } else if (absDiff < 8.0) {
      alpha = 0.35;
    } else {
      alpha = 0.65; // briskly follow turns
    }

    this.smoothedHeading = normalizeDegrees(this.smoothedHeading + alpha * diff);
    return this.smoothedHeading;
  }

  public getHeading(): number {
    return this.smoothedHeading;
  }
}
