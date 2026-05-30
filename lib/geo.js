const EARTH_RADIUS_METERS = 6371000;

/** Haversine distance between two WGS84 points in meters. */
export function distanceMeters(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(a));
}

/** Rough bounding box for a radius in meters (for DB pre-filter). */
export function boundingBox(latitude, longitude, radiusMeters) {
  const latDelta = radiusMeters / 111320;
  const lngDelta =
    radiusMeters / (111320 * Math.cos((latitude * Math.PI) / 180) || 1e-6);
  return {
    minLat: latitude - latDelta,
    maxLat: latitude + latDelta,
    minLng: longitude - lngDelta,
    maxLng: longitude + lngDelta,
  };
}

/** Centroid of coordinate list. */
export function centroidFromCoords(coords) {
  if (!coords.length) return null;
  const sum = coords.reduce(
    (acc, c) => ({ lat: acc.lat + c.latitude, lng: acc.lng + c.longitude }),
    { lat: 0, lng: 0 }
  );
  return {
    latitude: sum.lat / coords.length,
    longitude: sum.lng / coords.length,
  };
}
