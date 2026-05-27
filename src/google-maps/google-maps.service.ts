import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface GeocodedAddress {
  formatted: string;
  street?: string;
  city?: string;
  state?: string;
  country?: string;
  lat: number;
  lng: number;
}

@Injectable()
export class GoogleMapsService {
  private readonly logger = new Logger(GoogleMapsService.name);
  private readonly apiKey: string | undefined;

  constructor(private readonly configService: ConfigService) {
    this.apiKey =
      this.configService.get<string>('GOOGLE_MAPS_API_KEY') ??
      this.configService.get<string>('VITE_GOOGLE_MAPS_API_KEY');
  }

  private ensureKey() {
    if (!this.apiKey) {
      throw new Error(
        'GOOGLE_MAPS_API_KEY is not configured. Set it in backend .env for geocoding.',
      );
    }
    return this.apiKey;
  }

  async reverseGeocode(lat: number, lng: number): Promise<GeocodedAddress | null> {
    const key = this.ensureKey();
    try {
      const { data } = await axios.get(
        'https://maps.googleapis.com/maps/api/geocode/json',
        {
          params: { latlng: `${lat},${lng}`, key, result_type: 'street_address|route|locality' },
        },
      );
      if (data.status !== 'OK' || !data.results?.length) {
        this.logger.warn(`Reverse geocode status: ${data.status}`);
        return null;
      }
      return this.parseGeocodeResult(data.results[0], lat, lng);
    } catch (err) {
      this.logger.error('Reverse geocode failed', err);
      return null;
    }
  }

  async geocodeAddress(address: string): Promise<GeocodedAddress | null> {
    const key = this.ensureKey();
    if (!address?.trim()) return null;
    try {
      const { data } = await axios.get(
        'https://maps.googleapis.com/maps/api/geocode/json',
        {
          params: { address, key, region: 'ng' },
        },
      );
      if (data.status !== 'OK' || !data.results?.length) {
        this.logger.warn(`Geocode status: ${data.status} for ${address}`);
        return null;
      }
      const loc = data.results[0].geometry?.location;
      return this.parseGeocodeResult(
        data.results[0],
        loc?.lat ?? 0,
        loc?.lng ?? 0,
      );
    } catch (err) {
      this.logger.error('Geocode failed', err);
      return null;
    }
  }

  private parseGeocodeResult(
    result: {
      formatted_address?: string;
      address_components?: Array<{ long_name: string; types: string[] }>;
      geometry?: { location?: { lat: number; lng: number } };
    },
    lat: number,
    lng: number,
  ): GeocodedAddress {
    const components = result.address_components ?? [];
    const pick = (...types: string[]) =>
      components.find((c) => types.some((t) => c.types.includes(t)))?.long_name;

    const loc = result.geometry?.location;
    return {
      formatted: result.formatted_address ?? `${lat}, ${lng}`,
      street: pick('route', 'street_address', 'premise'),
      city: pick('locality', 'administrative_area_level_2', 'neighborhood'),
      state: pick('administrative_area_level_1'),
      country: pick('country'),
      lat: loc?.lat ?? lat,
      lng: loc?.lng ?? lng,
    };
  }

  googleMapsLink(lat: number, lng: number): string {
    return `https://www.google.com/maps?q=${lat},${lng}`;
  }

  streetViewLink(lat: number, lng: number): string {
    return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;
  }

  directionsLink(destLat: number, destLng: number, originLat?: number, originLng?: number): string {
    const dest = `${destLat},${destLng}`;
    if (originLat != null && originLng != null) {
      return `https://www.google.com/maps/dir/?api=1&origin=${originLat},${originLng}&destination=${dest}`;
    }
    return `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
  }
}
