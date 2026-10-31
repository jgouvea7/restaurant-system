import { Injectable } from '@nestjs/common';

export interface AddressCoordinates {
  latitude: number;
  longitude: number;
}

export interface AddressToGeocode {
  street: string;
  number: string;
  city: string;
  state: string;
}

export interface ViaCepAddress {
  cep: string;
  logradouro: string;
  complemento: string;
  unidade: string;
  bairro: string;
  localidade: string;
  uf: string;
  estado: string;
  regiao: string;
  ibge: string;
  gia: string;
  ddd: string;
  siafi: string;
}

interface NominatimResult {
  lat: string;
  lon: string;
}

@Injectable()
export class GeolocationService {
  async findAddressByCep(cep: string): Promise<ViaCepAddress | null> {
    const normalizedCep = cep.replace(/\D/g, '');

    if (normalizedCep.length !== 8) {
      return null;
    }

    let response: Response;

    try {
      response = await fetch(
        `https://viacep.com.br/ws/${normalizedCep}/json/`,
        { signal: AbortSignal.timeout(5000) },
      );
    } catch {
      return null;
    }

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as
      | ViaCepAddress
      | { erro: true }
      | null;

    if (!data || 'erro' in data) {
      return null;
    }

    return data;
  }

  async findCordByAddress(
    address: AddressToGeocode,
  ): Promise<AddressCoordinates | null> {
    const query = [address.street, address.number, address.city, address.state]
      .filter(Boolean)
      .join(', ');

    if (!query) {
      return null;
    }

    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', '1');
    url.searchParams.set('countrycodes', 'br');
    url.searchParams.set('q', query);

    let response: Response;

    try {
      response = await fetch(url.toString(), {
        headers: {
          'User-Agent': 'RestaurantGeolocationService/1.0',
        },
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      return null;
    }

    if (!response.ok) {
      return null;
    }

    const results = (await response.json()) as NominatimResult[];
    const result = results[0];

    if (!result) {
      return null;
    }

    const latitude = Number(result.lat);
    const longitude = Number(result.lon);

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return null;
    }

    return { latitude, longitude };
  }
}
