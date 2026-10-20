import { Injectable } from '@nestjs/common';

export interface AddressCoordinates {
  latitude: number;
  longitude: number;
}

interface NominatimResult {
  lat: string;
  lon: string;
}

@Injectable()
export class AddressService {
  async findAddressByCep(cep: string) {
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`)
    if(response) {
      return response
    }
  }

  async findCordByAddress(address: {
    street: string;
    number: string;
    city: string;
    state: string;
  }): Promise<AddressCoordinates | null> {
    const query = [ address.street, address.number, address.city, address.state].filter(Boolean).join(', ')
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "1");
    url.searchParams.set("countrycodes", "br");
    url.searchParams.set("q", query);


    let response: Response;

    try {
      response = await fetch(url.toString(), {
        headers: {
          "User-Agent": "RestaurantUserService/1.0",
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

    const result = results[0]

    if(!result) {
      return null;
    }

    const latitude = Number(result.lat);
    const longitude = Number(result.lon)

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
