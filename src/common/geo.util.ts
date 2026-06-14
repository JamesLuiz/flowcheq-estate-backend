/** Shared geospatial helpers */

export const AGENT_ONSITE_VERIFY_RADIUS_M = 30;
export const PHOTO_GPS_VERIFY_RADIUS_M = 100;

/** 10% of photo verify radius — minimum drift before agent GPS updates listing pin */
export const AGENT_GPS_CORRECTION_FRACTION = 0.1;
export const AGENT_GPS_CORRECTION_MIN_M = 5;
export const AGENT_GPS_CORRECTION_THRESHOLD_M = Math.max(
  AGENT_GPS_CORRECTION_MIN_M,
  PHOTO_GPS_VERIFY_RADIUS_M * AGENT_GPS_CORRECTION_FRACTION,
);

export type LatLng = { lat: number; lng: number };

export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function medianPhotoGps(
  photos: Array<{ lat?: number; lng?: number }>,
): LatLng | null {
  const valid = photos.filter(
    (p) =>
      typeof p.lat === 'number' &&
      typeof p.lng === 'number' &&
      !Number.isNaN(p.lat) &&
      !Number.isNaN(p.lng),
  );
  if (valid.length === 0) return null;

  const lats = valid.map((p) => p.lat!).sort((a, b) => a - b);
  const lngs = valid.map((p) => p.lng!).sort((a, b) => a - b);
  const mid = Math.floor(valid.length / 2);

  return {
    lat:
      valid.length % 2 === 1
        ? lats[mid]
        : (lats[mid - 1] + lats[mid]) / 2,
    lng:
      valid.length % 2 === 1
        ? lngs[mid]
        : (lngs[mid - 1] + lngs[mid]) / 2,
  };
}

export type CoordinatesCorrection = {
  previousLat: number;
  previousLng: number;
  distanceMeters: number;
  correctedAt: Date;
};

export type AgentGpsCoordinateUpdate = {
  coordinates: LatLng;
  coordinatesSource: 'agent_gps';
  coordinatesUpdatedAt: Date;
  coordinatesCorrection?: CoordinatesCorrection;
};

/**
 * When agent GPS photos differ from the listing pin by more than the threshold,
 * shift coordinates to the median photo GPS (or set them if missing).
 */
export function resolveAgentGpsCoordinateUpdate(
  listingCoords: LatLng | null | undefined,
  taggedPhotos: Array<{ lat?: number; lng?: number }>,
  thresholdMeters = AGENT_GPS_CORRECTION_THRESHOLD_M,
): AgentGpsCoordinateUpdate | null {
  const centroid = medianPhotoGps(taggedPhotos);
  if (!centroid) return null;

  const now = new Date();

  if (!listingCoords?.lat || !listingCoords?.lng) {
    return {
      coordinates: centroid,
      coordinatesSource: 'agent_gps',
      coordinatesUpdatedAt: now,
    };
  }

  const distanceMeters = haversineMeters(
    listingCoords.lat,
    listingCoords.lng,
    centroid.lat,
    centroid.lng,
  );

  if (distanceMeters <= thresholdMeters) {
    return null;
  }

  return {
    coordinates: centroid,
    coordinatesSource: 'agent_gps',
    coordinatesUpdatedAt: now,
    coordinatesCorrection: {
      previousLat: listingCoords.lat,
      previousLng: listingCoords.lng,
      distanceMeters: Math.round(distanceMeters * 10) / 10,
      correctedAt: now,
    },
  };
}
