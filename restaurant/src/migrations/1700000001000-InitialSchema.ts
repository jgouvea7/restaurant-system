import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1700000001000 implements MigrationInterface {
  name = 'InitialSchema1700000001000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "order_status_enum" AS ENUM (
          'pending_payment', 'confirmed', 'preparing', 'ready',
          'out_for_delivery', 'delivered', 'cancelled', 'payment_rejected'
        );
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "outbox_events_status_enum" AS ENUM (
          'pending', 'processing', 'published'
        );
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "processed_events_status_enum" AS ENUM (
          'processing', 'processed'
        );
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "restaurant" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying NOT NULL,
        "slug" character varying NOT NULL,
        "description" character varying,
        "phone" character varying NOT NULL,
        "ownerUserId" uuid NOT NULL,
        "createdAt" timestamp(6) NOT NULL DEFAULT now(),
        "updatedAt" timestamp(6) NOT NULL DEFAULT now(),
        CONSTRAINT "PK_restaurant" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "restaurant_address" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "street" character varying NOT NULL,
        "number" character varying NOT NULL,
        "city" character varying NOT NULL,
        "state" character varying NOT NULL,
        "postalCode" character varying NOT NULL,
        "latitude" numeric(10,8) NOT NULL,
        "longitude" numeric(11,8) NOT NULL,
        "restaurantId" uuid,
        CONSTRAINT "PK_restaurant_address" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_restaurant_address_restaurant" UNIQUE ("restaurantId"),
        CONSTRAINT "FK_restaurant_address_restaurant"
          FOREIGN KEY ("restaurantId") REFERENCES "restaurant"("id")
          ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "product" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying NOT NULL,
        "description" character varying,
        "price" numeric(10,2) NOT NULL,
        "imageUrl" character varying,
        "isAvailable" boolean NOT NULL,
        "isActive" boolean NOT NULL,
        "preparationTimeMinutes" integer,
        "createdAt" timestamp(6) NOT NULL DEFAULT now(),
        "updatedAt" timestamp(6) NOT NULL DEFAULT now(),
        "restaurantId" uuid,
        CONSTRAINT "PK_product" PRIMARY KEY ("id"),
        CONSTRAINT "FK_product_restaurant"
          FOREIGN KEY ("restaurantId") REFERENCES "restaurant"("id")
          ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "orders" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "restaurantId" uuid NOT NULL,
        "costumerUserId" uuid NOT NULL,
        "total" numeric(10,2) NOT NULL,
        "status" "order_status_enum" NOT NULL DEFAULT 'pending_payment',
        "paymentMethod" character varying NOT NULL,
        "deliveryAddress" character varying,
        "courierId" uuid,
        "courierAssignedAt" timestamp(6),
        "createdAt" timestamp(6) NOT NULL DEFAULT now(),
        "updatedAt" timestamp(6) NOT NULL DEFAULT now(),
        CONSTRAINT "PK_orders" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "order_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "order_id" uuid,
        "productId" uuid NOT NULL,
        "productName" character varying NOT NULL,
        "unitPrice" numeric(10,2) NOT NULL,
        "quantity" integer NOT NULL,
        "subtotal" numeric(10,2) NOT NULL,
        CONSTRAINT "PK_order_items" PRIMARY KEY ("id"),
        CONSTRAINT "FK_order_items_order"
          FOREIGN KEY ("order_id") REFERENCES "orders"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "outbox_events" (
        "id" uuid NOT NULL,
        "type" character varying NOT NULL,
        "source" character varying NOT NULL,
        "data" jsonb NOT NULL,
        "occurredAt" timestamp(6) NOT NULL,
        "status" "outbox_events_status_enum" NOT NULL DEFAULT 'pending',
        "attempts" integer NOT NULL DEFAULT 0,
        "nextAttemptAt" timestamp(6),
        "lastError" text,
        "publishedAt" timestamp(6),
        "createdAt" timestamp(6) NOT NULL DEFAULT now(),
        "updatedAt" timestamp(6) NOT NULL DEFAULT now(),
        CONSTRAINT "PK_outbox_events" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "processed_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "consumer" character varying NOT NULL,
        "eventId" uuid NOT NULL,
        "status" "processed_events_status_enum" NOT NULL DEFAULT 'processing',
        "lockedUntil" timestamp(6) NOT NULL,
        "processedAt" timestamp(6),
        "createdAt" timestamp(6) NOT NULL DEFAULT now(),
        "updatedAt" timestamp(6) NOT NULL DEFAULT now(),
        CONSTRAINT "PK_processed_events" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_processed_events_consumer_event"
          UNIQUE ("consumer", "eventId")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_outbox_events_pending"
        ON "outbox_events" ("status", "nextAttemptAt")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_outbox_events_processing"
        ON "outbox_events" ("status", "updatedAt")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "processed_events"');
    await queryRunner.query('DROP TABLE IF EXISTS "outbox_events"');
    await queryRunner.query('DROP TABLE IF EXISTS "order_items"');
    await queryRunner.query('DROP TABLE IF EXISTS "orders"');
    await queryRunner.query('DROP TABLE IF EXISTS "product"');
    await queryRunner.query('DROP TABLE IF EXISTS "restaurant_address"');
    await queryRunner.query('DROP TABLE IF EXISTS "restaurant"');
    await queryRunner.query('DROP TYPE IF EXISTS "processed_events_status_enum"');
    await queryRunner.query('DROP TYPE IF EXISTS "outbox_events_status_enum"');
    await queryRunner.query('DROP TYPE IF EXISTS "order_status_enum"');
  }
}
