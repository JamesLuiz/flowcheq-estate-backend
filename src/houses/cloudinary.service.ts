import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';
import { UploadApiResponse, UploadApiErrorResponse } from 'cloudinary';

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

  async uploadToCloudinary(buffer: Buffer, filename: string): Promise<string> {
    const result = await this.uploadToCloudinaryWithPublicId(buffer, filename, 'nestin-estate/properties');
    return result.url;
  }

  async uploadToCloudinaryWithPublicId(
    buffer: Buffer,
    filename: string,
    folder: string = 'nestin-estate/properties',
  ): Promise<UploadResult> {
    if (!this.isConfigured) {
      throw new Error(
        'Image upload service is not configured. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.'
      );
    }
    try {
      const result = await new Promise<UploadApiResponse>((resolve, reject) => {
        const upload = cloudinary.uploader.upload_stream(
          {
            resource_type: 'image',
            folder: folder,
            format: 'webp',
            quality: 'auto',
            public_id: filename.split('.')[0],
          },
          (error, result) => {
            if (error) return reject(error);
            if (!result) return reject(new Error('No result from Cloudinary'));
            resolve(result);
          },
        );

        // Pipe the file buffer into Cloudinary
        Readable.from(buffer).pipe(upload);
      });

      return {
        url: result.secure_url,
        publicId: result.public_id,
      };
    } catch (error) {
      console.error('Cloudinary upload error:', error);
      // Surface a clearer message to the controller/clients
      throw new Error(
        (error as any)?.message || 'Failed to upload image'
      );
    }
  }

  async uploadVerificationDocument(
    buffer: Buffer,
    filename: string,
    userRole: 'agent' | 'landlord',
  ): Promise<UploadResult> {
    const folder = `nestin-estate/verifications/${userRole}`;
    return this.uploadToCloudinaryWithPublicId(buffer, filename, folder);
  }

  async deleteFromCloudinary(publicId: string): Promise<boolean> {
    try {
      const result = await cloudinary.uploader.destroy(publicId);
      return result.result === 'ok';
    } catch (error) {
      console.error('Cloudinary delete error:', error);
      return false;
    }
  }
}

