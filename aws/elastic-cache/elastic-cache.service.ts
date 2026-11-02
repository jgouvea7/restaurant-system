import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import Redis from 'ioredis';

export interface GeoLocation {
  member: string;
  longitude: number;
  latitude: number;
}

export interface GeoSearchOptions {
  longitude: number;
  latitude: number;
  radiusKm: number;
  limit?: number;
}

export interface GeoSearchResult {
  member: string;
  distanceKm: number;
}

@Injectable()
export class ElastiCacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ElastiCacheService.name);
  private client!: Redis;

  onModuleInit(): void {
    const host =
      process.env.REDIS_HOST ?? process.env.ELASTICACHE_HOST ?? 'localhost';
    const port = Number(
      process.env.REDIS_PORT ?? process.env.ELASTICACHE_PORT ?? 16379,
    );

    this.client = new Redis({
      host,
      port,
      password: process.env.REDIS_PASSWORD || undefined,
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      retryStrategy: (attempt) => Math.min(attempt * 200, 2000),
    });

    this.client.on('error', (error: Error) => {
      this.logger.error(`Falha na conexao com o Redis: ${error.message}`);
    });

    this.client.connect().catch((error: Error) => {
      this.logger.error(
        `Nao foi possivel iniciar a conexao com o Redis: ${error.message}`,
      );
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.client) {
      return;
    }

    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }

  async addLocation(key: string, location: GeoLocation): Promise<number> {
    return this.client.geoadd(
      key,
      location.longitude,
      location.latitude,
      location.member,
    );
  }

  async addLocations(key: string, locations: GeoLocation[]): Promise<number> {
    if (locations.length === 0) {
      return 0;
    }

    const args = locations.flatMap((location) => [
      location.longitude,
      location.latitude,
      location.member,
    ]);

    return this.client.geoadd(key, ...args);
  }

  async findNearby(
    key: string,
    options: GeoSearchOptions,
  ): Promise<GeoSearchResult[]> {
    const limit = options.limit ?? 20;

    const response = (await this.client.geosearch(
      key,
      'FROMLONLAT',
      options.longitude,
      options.latitude,
      'BYRADIUS',
      options.radiusKm,
      'km',
      'ASC',
      'COUNT',
      limit,
      'WITHDIST',
    )) as unknown[];

    return response.map((entry) => {
      if (Array.isArray(entry)) {
        const [member, distance] = entry as [string, string];

        return { member: String(member), distanceKm: Number(distance) };
      }

      return { member: String(entry), distanceKm: 0 };
    });
  }

  async getPosition(
    key: string,
    member: string,
  ): Promise<{ longitude: number; latitude: number } | null> {
    const [position] = await this.client.geopos(key, member);

    if (!position) {
      return null;
    }

    const [longitude, latitude] = position;

    return { longitude: Number(longitude), latitude: Number(latitude) };
  }

  async removeLocation(key: string, member: string): Promise<number> {
    return this.client.zrem(key, member);
  }

  async addToSet(key: string, member: string): Promise<number> {
    return this.client.sadd(key, member);
  }

  async removeFromSet(key: string, member: string): Promise<number> {
    return this.client.srem(key, member);
  }

  async getSetMembers(key: string): Promise<string[]> {
    return this.client.smembers(key);
  }
}
