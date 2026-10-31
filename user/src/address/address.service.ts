import { Injectable } from '@nestjs/common';
import {
  AddressCoordinates,
  AddressToGeocode,
  GeolocationService,
  ViaCepAddress,
} from '@restaurant/geolocation';

export type { AddressCoordinates, AddressToGeocode, ViaCepAddress };

@Injectable()
export class AddressService {
  constructor(
    private readonly geolocationService: GeolocationService
  ) {}

  findAddressByCep(cep: string): Promise<ViaCepAddress | null> {
    return this.geolocationService.findAddressByCep(cep);
  }

  findCordByAddress(
    address: AddressToGeocode,
  ): Promise<AddressCoordinates | null> {
    return this.geolocationService.findCordByAddress(address);
  }
}
