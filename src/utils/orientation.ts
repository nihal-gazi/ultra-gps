/**
 * Device orientation parsing, compass heading calculation, and circular smoothing filter.
 * Eliminates jitter, gimbal-lock singularities, and multi-source clashing.
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
 * Computes robust, singularity-free compass heading from Euler angles (alpha, beta, gamma).
 * Seamlessly handles flat, tilted, portrait, and landscape orientations without jumping.
 */
export function computeRobustCompassHeading(
  alpha: number,
  beta: number,
  gamma: number
): number {
  // If device is held reasonably flat (|pitch| < 25° and |roll| < 25°), direct yaw (360 - alpha) is most stable
  if (Math.abs(beta) < 25 && Math.abs(gamma) < 25) {
    return normalizeDegrees(360 - alpha);
  }

  const a = degreesToRadians(alpha);
  const b = degreesToRadians(beta);
  const g = degreesToRadians(gamma);

  // W3C standard earth-frame vector projection
  const sA = Math.sin(a);
  const cA = Math.cos(a);
  const sB = Math.sin(b);
  const sG = Math.sin(g);
  const cG = Math.cos(g);

  // Components pointing towards geographic North
  const x = -sA * cG - cA * sB * sG;
  const y = -cA * cG + sA * sB * sG;

  // Fallback to alpha if magnitude is too small near extreme vertical tilt
  if (Math.abs(x) < 0.001 && Math.abs(y) < 0.001) {
    return normalizeDegrees(360 - alpha);
  }

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

    // Adaptive smoothing factor:
    // Small jitter (< 3°) is heavily filtered (alpha = 0.08) for rock-steady pointer
    // Fast turns (> 20°) follow briskly (alpha = 0.40) to prevent lag
    let alpha: number;
    if (absDiff < 1.0) {
      alpha = 0.05; // deadband for micro-vibrations
    } else if (absDiff < 5.0) {
      alpha = 0.12;
    } else if (absDiff < 20.0) {
      alpha = 0.25;
    } else {
      alpha = 0.45;
    }

    this.smoothedHeading = normalizeDegrees(this.smoothedHeading + alpha * diff);
    return this.smoothedHeading;
  }

  public getHeading(): number {
    return this.smoothedHeading;
  }
}
