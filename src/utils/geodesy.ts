/**
 * Geodesy utility functions using Great-Circle / Spherical Earth models
 * Mean Earth Radius WGS-84: R = 6,371,000 meters (or equatorial 6,378,137m)
 */

export const EARTH_RADIUS_METERS = 6371000;

export function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

/**
 * Calculates the destination point given start point, distance (meters), and bearing (degrees clockwise from North).
 * Uses the spherical Earth direct geodetic formula.
 */
export function calculateDestinationPoint(
  lat: number,
  lng: number,
  distanceMeters: number,
  bearingDegrees: number
): { lat: number; lng: number } {
  if (distanceMeters === 0) return { lat, lng };

  const delta = distanceMeters / EARTH_RADIUS_METERS; // angular distance in radians
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
  // Normalize longitude to -180 .. +180
  const destLng = ((radiansToDegrees(lambda2) + 540) % 360) - 180;

  return {
    lat: Number(destLat.toFixed(8)),
    lng: Number(destLng.toFixed(8)),
  };
}

/**
 * Calculates the great-circle distance between two points using the Haversine formula (in meters).
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

/**
 * Calculates initial bearing from point 1 to point 2 in degrees (0 - 360).
 */
export function calculateBearing(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const phi1 = degreesToRadians(lat1);
  const phi2 = degreesToRadians(lat2);
  const deltaLambda = degreesToRadians(lng2 - lng1);

  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);

  const theta = Math.atan2(y, x);
  return (radiansToDegrees(theta) + 360) % 360;
}

/**
 * Formats coordinates into standard high-precision string
 */
export function formatCoordinates(lat: number, lng: number): string {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lngDir = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(6)}° ${latDir}, ${Math.abs(lng).toFixed(6)}° ${lngDir}`;
}
