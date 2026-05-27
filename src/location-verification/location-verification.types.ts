export type LocationMatchStatus = 'VERIFIED' | 'MISMATCH' | 'UNVERIFIABLE';

export interface PhotoLocationVerificationResult {
  extractedCoordinates: { lat: number; lng: number } | null;
  resolvedAddress: {
    formatted: string;
    street?: string;
    city?: string;
    state?: string;
    country?: string;
  } | null;
  expectedAddress: string;
  expectedCoordinates: { lat: number; lng: number } | null;
  matchStatus: LocationMatchStatus;
  confidenceScore: number;
  distanceMeters: number | null;
  googleMapsLink: string | null;
  streetViewLink: string | null;
  googleMapsExpectedLink: string | null;
  message: string;
}
