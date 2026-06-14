import { BadRequestException } from '@nestjs/common';
import {
  GPS_PHOTO_MAX,
  GPS_PHOTO_MIN,
  OwnershipDocumentType,
  requiredDocsForListingType,
} from '../common/listing-requirements';

export type TaggedPhotoInput = {
  url: string;
  publicId?: string;
  tag: string;
  description?: string;
  lat?: number;
  lng?: number;
  accuracy?: number;
  capturedAt?: Date | string;
  gpsVerified?: boolean;
};

export function validateGpsPhotoCount(taggedPhotos: TaggedPhotoInput[] | undefined) {
  const count = taggedPhotos?.length ?? 0;
  if (count < GPS_PHOTO_MIN || count > GPS_PHOTO_MAX) {
    throw new BadRequestException(
      `Listings require ${GPS_PHOTO_MIN}–${GPS_PHOTO_MAX} GPS-verified photos (you provided ${count}).`,
    );
  }
}

export function validateGpsPhotoMetadata(taggedPhotos: TaggedPhotoInput[] | undefined) {
  validateGpsPhotoCount(taggedPhotos);
  if (!taggedPhotos?.length) return;

  for (let i = 0; i < taggedPhotos.length; i++) {
    const photo = taggedPhotos[i];
    const hasCoords =
      typeof photo.lat === 'number' &&
      typeof photo.lng === 'number' &&
      !Number.isNaN(photo.lat) &&
      !Number.isNaN(photo.lng);

    if (!hasCoords && !photo.gpsVerified) {
      throw new BadRequestException(
        `Photo ${i + 1} must include GPS coordinates from Flowcheq Capture (in-app camera). Gallery uploads are not allowed.`,
      );
    }
  }
}

export function validateOwnershipDocuments(
  listingType: 'rent' | 'buy',
  docs: Array<{ type: string }> | undefined,
) {
  const required = requiredDocsForListingType(listingType);
  const provided = new Set((docs ?? []).map((d) => d.type));

  const missing = required.filter((r) => !provided.has(r));
  if (missing.length > 0) {
    const label =
      listingType === 'rent'
        ? 'For rent: C of O and utility bill are required.'
        : 'For sale: C of O, deed, governor\'s consent, and land survey are required.';
    throw new BadRequestException(
      `${label} Missing: ${missing.join(', ')}.`,
    );
  }
}

export function parseOwnershipDocTypes(raw: unknown): OwnershipDocumentType[] {
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((t) =>
      Object.values(OwnershipDocumentType).includes(t as OwnershipDocumentType),
    ) as OwnershipDocumentType[];
  } catch {
    return [];
  }
}
