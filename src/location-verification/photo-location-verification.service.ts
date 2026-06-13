import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import exifr from 'exifr';
import { GoogleMapsService } from '../google-maps/google-maps.service';
import { haversineMeters, PHOTO_GPS_VERIFY_RADIUS_M } from '../common/geo.util';
import { House, HouseDocument } from '../houses/schemas/house.schema';
import {
  LocationMatchStatus,
  PhotoLocationVerificationResult,
} from './location-verification.types';

export const DEFAULT_VERIFY_RADIUS_METERS = PHOTO_GPS_VERIFY_RADIUS_M;

@Injectable()
export class PhotoLocationVerificationService {
  constructor(
    private readonly googleMaps: GoogleMapsService,
    @InjectModel(House.name) private readonly houseModel: Model<HouseDocument>,
  ) {}

  async extractGpsFromPhoto(buffer: Buffer): Promise<{ lat: number; lng: number } | null> {
    try {
      const gps = await exifr.gps(buffer);
      if (gps?.latitude != null && gps?.longitude != null) {
        return { lat: gps.latitude, lng: gps.longitude };
      }
      const all = await exifr.parse(buffer, { gps: true });
      if (all?.latitude != null && all?.longitude != null) {
        return { lat: all.latitude, lng: all.longitude };
      }
      return null;
    } catch {
      return null;
    }
  }

  addressSimilarity(
    resolved: { city?: string; state?: string; country?: string; formatted: string },
    expected: { city?: string; state?: string; country?: string; formatted: string },
  ): number {
    const norm = (s?: string) => (s ?? '').toLowerCase().trim();
    let score = 0;
    let checks = 0;
    if (norm(expected.state) && norm(resolved.state)) {
      checks++;
      if (norm(resolved.state).includes(norm(expected.state)) || norm(expected.state).includes(norm(resolved.state))) {
        score += 1;
      }
    }
    if (norm(expected.city) && norm(resolved.city)) {
      checks++;
      if (norm(resolved.city).includes(norm(expected.city)) || norm(expected.city).includes(norm(resolved.city))) {
        score += 1;
      }
    }
    if (norm(expected.country) && norm(resolved.country)) {
      checks++;
      if (norm(resolved.country) === norm(expected.country)) score += 1;
    }
    const fmtA = norm(resolved.formatted);
    const fmtB = norm(expected.formatted);
    if (fmtA && fmtB) {
      checks++;
      const tokensB = fmtB.split(/[,\s]+/).filter((t) => t.length > 3);
      const hits = tokensB.filter((t) => fmtA.includes(t)).length;
      if (hits >= Math.min(2, tokensB.length)) score += 1;
    }
    return checks > 0 ? score / checks : 0.5;
  }

  buildResult(params: {
    coords: { lat: number; lng: number } | null;
    resolved: Awaited<ReturnType<GoogleMapsService['reverseGeocode']>>;
    expectedAddress: string;
    expectedCoords: { lat: number; lng: number } | null;
    expectedResolved: Awaited<ReturnType<GoogleMapsService['reverseGeocode']>>;
    radiusMeters: number;
  }): PhotoLocationVerificationResult {
    const { coords, resolved, expectedAddress, expectedCoords, expectedResolved, radiusMeters } =
      params;

    if (!coords) {
      return {
        extractedCoordinates: null,
        resolvedAddress: null,
        expectedAddress,
        expectedCoordinates: expectedCoords,
        matchStatus: 'UNVERIFIABLE',
        confidenceScore: 0,
        distanceMeters: null,
        googleMapsLink: null,
        streetViewLink: null,
        googleMapsExpectedLink: expectedCoords
          ? this.googleMaps.googleMapsLink(expectedCoords.lat, expectedCoords.lng)
          : null,
        message:
          'No GPS metadata in photo. Retake with location services enabled on your camera (Flowcheq Capture recommended).',
      };
    }

    const distanceMeters =
      expectedCoords != null
        ? Math.round(haversineMeters(coords.lat, coords.lng, expectedCoords.lat, expectedCoords.lng))
        : null;

    const addrSim =
      resolved && expectedResolved
        ? this.addressSimilarity(resolved, expectedResolved)
        : resolved && expectedAddress
          ? this.addressSimilarity(resolved, { formatted: expectedAddress })
          : 0.4;

    const distanceOk =
      distanceMeters != null ? distanceMeters <= radiusMeters : false;
    const distanceScore =
      distanceMeters != null
        ? Math.max(0, 1 - distanceMeters / radiusMeters) * 50
        : 0;
    const addressScore = addrSim * 50;
    const confidenceScore = Math.round(Math.min(100, distanceScore + addressScore));

    let matchStatus: LocationMatchStatus = 'MISMATCH';
    if (distanceOk && addrSim >= 0.45) {
      matchStatus = 'VERIFIED';
    } else if (!expectedCoords && !expectedAddress?.trim()) {
      matchStatus = 'UNVERIFIABLE';
    }

    const message =
      matchStatus === 'VERIFIED'
        ? `Photo location matches expected property (within ${radiusMeters}m).`
        : matchStatus === 'MISMATCH'
          ? `Photo GPS is ~${distanceMeters ?? '?'}m from expected location. Compare pins on the map.`
          : 'Could not compare to expected coordinates.';

    return {
      extractedCoordinates: coords,
      resolvedAddress: resolved
        ? {
            formatted: resolved.formatted,
            street: resolved.street,
            city: resolved.city,
            state: resolved.state,
            country: resolved.country,
          }
        : null,
      expectedAddress,
      expectedCoordinates: expectedCoords,
      matchStatus,
      confidenceScore,
      distanceMeters,
      googleMapsLink: this.googleMaps.googleMapsLink(coords.lat, coords.lng),
      streetViewLink: this.googleMaps.streetViewLink(coords.lat, coords.lng),
      googleMapsExpectedLink: expectedCoords
        ? this.googleMaps.googleMapsLink(expectedCoords.lat, expectedCoords.lng)
        : null,
      message,
    };
  }

  async verifyPhotoForProperty(
    file: Express.Multer.File,
    propertyId: string,
    radiusMeters = DEFAULT_VERIFY_RADIUS_METERS,
  ): Promise<PhotoLocationVerificationResult> {
    if (!Types.ObjectId.isValid(propertyId)) {
      throw new BadRequestException('Invalid property ID');
    }
    const house = await this.houseModel.findById(propertyId).exec();
    if (!house) {
      throw new NotFoundException('Property not found');
    }

    const expectedAddress = this.formatHouseAddress(house);
    const expectedCoords =
      house.coordinates?.lat != null && house.coordinates?.lng != null
        ? { lat: house.coordinates.lat, lng: house.coordinates.lng }
        : null;

    let expectedResolved = expectedCoords
      ? await this.googleMaps.reverseGeocode(expectedCoords.lat, expectedCoords.lng)
      : null;
    if (!expectedResolved && expectedAddress) {
      expectedResolved = await this.googleMaps.geocodeAddress(expectedAddress);
    }

    const coords = await this.extractGpsFromPhoto(file.buffer);
    const resolved = coords
      ? await this.googleMaps.reverseGeocode(coords.lat, coords.lng)
      : null;

    const result = this.buildResult({
      coords,
      resolved,
      expectedAddress,
      expectedCoords: expectedResolved
        ? { lat: expectedResolved.lat, lng: expectedResolved.lng }
        : expectedCoords,
      expectedResolved: expectedResolved ?? (expectedAddress ? { formatted: expectedAddress, lat: 0, lng: 0 } : null),
      radiusMeters,
    });

    if (result.matchStatus !== 'UNVERIFIABLE') {
      await this.houseModel.findByIdAndUpdate(propertyId, {
        photoLocationVerification: {
          ...result,
          verifiedAt: new Date(),
        },
        ...(result.matchStatus === 'VERIFIED' ? { gpsVerifiedPhotos: true } : {}),
      });
    }

    return result;
  }

  async verifyPhotoWithExpectedAddress(
    file: Express.Multer.File,
    expectedAddress: string,
    expectedLat?: number,
    expectedLng?: number,
    radiusMeters = DEFAULT_VERIFY_RADIUS_METERS,
  ): Promise<PhotoLocationVerificationResult> {
    let expectedCoords =
      expectedLat != null && expectedLng != null
        ? { lat: expectedLat, lng: expectedLng }
        : null;

    let expectedResolved = expectedCoords
      ? await this.googleMaps.reverseGeocode(expectedCoords.lat, expectedCoords.lng)
      : await this.googleMaps.geocodeAddress(expectedAddress);

    if (expectedResolved && !expectedCoords) {
      expectedCoords = { lat: expectedResolved.lat, lng: expectedResolved.lng };
    }

    const coords = await this.extractGpsFromPhoto(file.buffer);
    const resolved = coords
      ? await this.googleMaps.reverseGeocode(coords.lat, coords.lng)
      : null;

    return this.buildResult({
      coords,
      resolved,
      expectedAddress,
      expectedCoords,
      expectedResolved: expectedResolved ?? { formatted: expectedAddress, lat: 0, lng: 0 },
      radiusMeters,
    });
  }

  private formatHouseAddress(house: HouseDocument): string {
    const parts = [
      (house as any).streetAddress,
      (house as any).city,
      (house as any).state,
      house.location,
    ].filter(Boolean);
    return parts.join(', ') || house.location || 'Unknown address';
  }
}
