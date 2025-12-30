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
  constructor(private readonly configService: ConfigService) {
    cloudinary.config({
      cloud_name: this.configService.get<string>('CLOUDINARY_CLOUD_NAME'),
      api_key: this.configService.get<string>('CLOUDINARY_API_KEY'),
      api_secret: this.configService.get<string>('CLOUDINARY_API_SECRET'),
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
      throw new Error('Failed to upload image');
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

