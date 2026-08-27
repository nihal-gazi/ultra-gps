/**
 * Geodesy utility functions using Great-Circle / Spherical Earth models.
 * Mean Earth Radius WGS-84: R = 6,371,000 meters
 */

export const EARTH_RADIUS_METERS = 6371000;

export function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

/**
 * Calculates destination point given start point, distance (meters), and bearing (degrees).
 */
export function calculateDestinationPoint(
  lat: number,
  lng: number,
  distanceMeters: number,
  bearingDegrees: number
): { lat: number; lng: number } {
  if (distanceMeters === 0) return { lat, lng };

  const delta = distanceMeters / EARTH_RADIUS_METERS;
  const theta = degreesToRadians(bearingDegrees);

  const phi1 = degreesToRadians(lat);
  const lambda1 = degreesToRadians(lng);

  const sinPhi1 = Math.sin(phi1);
  const cosPhi1 = Math.cos(phi1);
  const sinDelta = Math.sin(delta);
  const cosDelta = Math.cos(delta);
  const sinTheta = Math.sin(theta);
  const cosTheta = Math.cos(theta);

  const phi2 = Math.asin(sinPhi1 * cosDelta + cosPhi1 * sinDelta * cosTheta);
  const y = sinTheta * sinDelta * cosPhi1;
  const x = cosDelta - sinPhi1 * Math.sin(phi2);
  const lambda2 = lambda1 + Math.atan2(y, x);

  const destLat = radiansToDegrees(phi2);
  const destLng = ((radiansToDegrees(lambda2) + 540) % 360) - 180;

  return {
    lat: Number(destLat.toFixed(8)),
    lng: Number(destLng.toFixed(8)),
  };
}

/**
 * Calculates great-circle distance between two points using the Haversine formula (in meters).
 */
export function calculateHaversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const phi1 = degreesToRadians(lat1);
  const phi2 = degreesToRadians(lat2);
  const deltaPhi = degreesToRadians(lat2 - lat1);
  const deltaLambda = degreesToRadians(lng2 - lng1);

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_METERS * c;
}
