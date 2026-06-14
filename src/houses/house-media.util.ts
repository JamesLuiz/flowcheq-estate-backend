import type { House } from './schemas/house.schema';

/** Cloudinary folder root — every listing upload lives under houses/{houseId}/ */
export const HOUSE_CLOUDINARY_ROOT = 'flowcheq-estate/houses';

export type HouseMediaSubfolder = 'photos' | 'ownership' | 'documents';

export function houseCloudinaryPrefix(houseId: string): string {
  return `${HOUSE_CLOUDINARY_ROOT}/${houseId}`;
}

export function houseCloudinaryFolder(
  houseId: string,
  subfolder: HouseMediaSubfolder,
): string {
  return `${houseCloudinaryPrefix(houseId)}/${subfolder}`;
}

/** Extract public_id from a Cloudinary delivery URL (legacy uploads included). */
export function extractPublicIdFromCloudinaryUrl(url: string): string | null {
  if (!url?.includes('res.cloudinary.com') || !url.includes('/upload/')) {
    return null;
  }
  const afterUpload = url.split('/upload/')[1];
  if (!afterUpload) return null;
  const withoutQuery = afterUpload.split('?')[0];
  const segments = withoutQuery.split('/');
  if (segments[0]?.startsWith('v') && segments.length > 1) {
    segments.shift();
  }
  const last = segments.pop();
  if (!last) return null;
  const withoutExt = last.replace(/\.[^/.]+$/, '');
  segments.push(withoutExt);
  return segments.join('/');
}

export function collectHouseMediaPublicIds(house: Partial<House>): string[] {
  const ids = new Set<string>();

  for (const photo of house.taggedPhotos ?? []) {
    if (photo.publicId) ids.add(photo.publicId);
    else {
      const fromUrl = extractPublicIdFromCloudinaryUrl(photo.url);
      if (fromUrl) ids.add(fromUrl);
    }
  }

  for (const doc of house.ownershipDocuments ?? []) {
    if (doc.publicId) ids.add(doc.publicId);
    else {
      const fromUrl = extractPublicIdFromCloudinaryUrl(doc.url);
      if (fromUrl) ids.add(fromUrl);
    }
  }

  if (house.proofOfAddressPublicId) {
    ids.add(house.proofOfAddressPublicId);
  } else if (house.proofOfAddress) {
    const fromUrl = extractPublicIdFromCloudinaryUrl(house.proofOfAddress);
    if (fromUrl) ids.add(fromUrl);
  }

  for (const imageUrl of house.images ?? []) {
    const fromUrl = extractPublicIdFromCloudinaryUrl(imageUrl);
    if (fromUrl) ids.add(fromUrl);
  }

  for (const publicId of house.imagePublicIds ?? []) {
    if (publicId) ids.add(publicId);
  }

  return [...ids];
}
