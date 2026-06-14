import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';
import { UploadApiResponse } from 'cloudinary';
import type { House } from './schemas/house.schema';
import {
  collectHouseMediaPublicIds,
  houseCloudinaryFolder,
  houseCloudinaryPrefix,
  type HouseMediaSubfolder,
} from './house-media.util';

export interface UploadResult {
  url: string;
  publicId: string;
}

@Injectable()
export class CloudinaryService {
  private readonly isConfigured: boolean;

  constructor(private readonly configService: ConfigService) {
    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET');

    this.isConfigured = Boolean(cloudName && apiKey && apiSecret);
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
    });
  }

  /** Legacy upload — prefer uploadForHouse for listing media. */
  async uploadToCloudinary(buffer: Buffer, filename: string): Promise<string> {
    const result = await this.uploadToCloudinaryWithPublicId(
      buffer,
      filename,
      'flowcheq-estate/legacy',
    );
    return result.url;
  }

  /**
   * Upload media scoped to a listing. All assets land under
   * flowcheq-estate/houses/{houseId}/{subfolder}/ for bulk purge on delist.
   */
  async uploadForHouse(
    houseId: string,
    buffer: Buffer,
    filename: string,
    subfolder: HouseMediaSubfolder = 'photos',
  ): Promise<UploadResult> {
    const folder = houseCloudinaryFolder(houseId, subfolder);
    const safeName = filename.replace(/[^\w.-]+/g, '_').slice(0, 80);
    const publicId = `${Date.now()}-${safeName}`;
    return this.uploadToCloudinaryWithPublicId(buffer, publicId, folder, {
      context: `house_id=${houseId}`,
      tags: [`house_${houseId}`, subfolder],
    });
  }

  async uploadToCloudinaryWithPublicId(
    buffer: Buffer,
    filename: string,
    folder: string = 'flowcheq-estate/legacy',
    options?: { context?: string; tags?: string[] },
  ): Promise<UploadResult> {
    if (!this.isConfigured) {
      throw new Error(
        'Image upload service is not configured. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.',
      );
    }

    const isPdf = filename.toLowerCase().endsWith('.pdf');
    const resourceType = isPdf ? 'raw' : 'image';

    try {
      const result = await new Promise<UploadApiResponse>((resolve, reject) => {
        const upload = cloudinary.uploader.upload_stream(
          {
            resource_type: resourceType,
            folder,
            ...(resourceType === 'image'
              ? { format: 'webp', quality: 'auto' }
              : {}),
            public_id: filename.split('.')[0],
            context: options?.context,
            tags: options?.tags,
          },
          (error, uploadResult) => {
            if (error) return reject(error);
            if (!uploadResult) return reject(new Error('No result from Cloudinary'));
            resolve(uploadResult);
          },
        );

        Readable.from(buffer).pipe(upload);
      });

      return {
        url: result.secure_url,
        publicId: result.public_id,
      };
    } catch (error) {
      console.error('Cloudinary upload error:', error);
      throw new Error((error as Error)?.message || 'Failed to upload image');
    }
  }

  async uploadVerificationDocument(
    buffer: Buffer,
    filename: string,
    userRole: 'agent' | 'landlord',
  ): Promise<UploadResult> {
    const folder = `flowcheq-estate/verifications/${userRole}`;
    return this.uploadToCloudinaryWithPublicId(buffer, filename, folder);
  }

  async deleteFromCloudinary(
    publicId: string,
    resourceType: 'image' | 'raw' = 'image',
  ): Promise<boolean> {
    if (!this.isConfigured || !publicId) return false;
    try {
      const result = await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
      return result.result === 'ok' || result.result === 'not found';
    } catch (error) {
      console.error('Cloudinary delete error:', error);
      return false;
    }
  }

  async deletePublicIds(publicIds: string[]): Promise<void> {
    if (!this.isConfigured || publicIds.length === 0) return;

    const unique = [...new Set(publicIds.filter(Boolean))];
    for (const resourceType of ['image', 'raw'] as const) {
      try {
        await cloudinary.api.delete_resources(unique, { resource_type: resourceType });
      } catch (error) {
        console.error(`Cloudinary batch delete (${resourceType}) error:`, error);
      }
    }
  }

  async deleteByHousePrefix(houseId: string): Promise<void> {
    if (!this.isConfigured) return;

    const prefix = houseCloudinaryPrefix(houseId);
    for (const resourceType of ['image', 'raw'] as const) {
      try {
        await cloudinary.api.delete_resources_by_prefix(prefix, {
          resource_type: resourceType,
        });
      } catch (error) {
        console.error(`Cloudinary prefix delete (${resourceType}) error:`, error);
      }
    }
  }

  /** Remove listing photos only (before GPS re-capture replaces them). */
  async deleteHousePhotos(houseId: string): Promise<void> {
    if (!this.isConfigured) return;

    const prefix = houseCloudinaryFolder(houseId, 'photos');
    for (const resourceType of ['image', 'raw'] as const) {
      try {
        await cloudinary.api.delete_resources_by_prefix(prefix, {
          resource_type: resourceType,
        });
      } catch (error) {
        console.error('Cloudinary photo prefix delete error:', error);
      }
    }
  }

  /** Permanently delete all Cloudinary assets for a listing. */
  async purgeHouseMedia(houseId: string, house?: Partial<House>): Promise<void> {
    if (!this.isConfigured) return;

    await this.deleteByHousePrefix(houseId);

    if (house) {
      const legacyIds = collectHouseMediaPublicIds(house).filter(
        (id) => !id.startsWith(houseCloudinaryPrefix(houseId)),
      );
      if (legacyIds.length > 0) {
        await this.deletePublicIds(legacyIds);
      }
    }
  }
}
