import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1700000001000 implements MigrationInterface {
  name = 'InitialSchema1700000001000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

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
      CREATE TABLE IF NOT EXISTS "user" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "firstName" character varying NOT NULL,
        "lastName" character varying NOT NULL,
        "email" character varying NOT NULL,
        "password" character varying NOT NULL,
        "status" character varying NOT NULL DEFAULT 'active',
        "createdAt" timestamp(6) NOT NULL DEFAULT now(),
        "updatedAt" timestamp(6) NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_user_email" UNIQUE ("email")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "courier" (
        "courierId" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "vehicleType" character varying NOT NULL,
        "available" character varying NOT NULL,
        "reservedForOrderId" uuid,
        "reservedAt" timestamp(6),
        "user_id" uuid,
        CONSTRAINT "PK_courier" PRIMARY KEY ("courierId"),
        CONSTRAINT "UQ_courier_user" UNIQUE ("user_id"),
        CONSTRAINT "FK_courier_user"
          FOREIGN KEY ("user_id") REFERENCES "user"("id")
          ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(
      'ALTER TABLE "courier" ADD COLUMN IF NOT EXISTS "reservedForOrderId" uuid',
    );
    await queryRunner.query(
      'ALTER TABLE "courier" ADD COLUMN IF NOT EXISTS "reservedAt" timestamp(6)',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "costumer" (
        "costumerId" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "phone" character varying NOT NULL,
        "user_id" uuid,
        CONSTRAINT "PK_costumer" PRIMARY KEY ("costumerId"),
        CONSTRAINT "UQ_costumer_user" UNIQUE ("user_id"),
        CONSTRAINT "FK_costumer_user"
          FOREIGN KEY ("user_id") REFERENCES "user"("id")
          ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "owner" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "document" character varying(14),
        "createdAt" timestamp(6) NOT NULL DEFAULT now(),
        "updatedAt" timestamp(6) NOT NULL DEFAULT now(),
        "user_id" uuid,
        CONSTRAINT "PK_owner" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_owner_user" UNIQUE ("user_id"),
        CONSTRAINT "FK_owner_user"
          FOREIGN KEY ("user_id") REFERENCES "user"("id")
          ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "address" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "street" character varying,
        "number" character varying,
        "city" character varying,
        "state" character varying,
        "postalCode" character varying,
        "latitude" numeric(10,8),
        "longitude" numeric(11,8),
        "costumer_id" uuid NOT NULL,
        CONSTRAINT "PK_address" PRIMARY KEY ("id"),
        CONSTRAINT "FK_address_costumer"
          FOREIGN KEY ("costumer_id") REFERENCES "costumer"("costumerId")
          ON DELETE NO ACTION ON UPDATE NO ACTION
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
    await queryRunner.query('DROP TABLE IF EXISTS "address"');
    await queryRunner.query('DROP TABLE IF EXISTS "owner"');
    await queryRunner.query('DROP TABLE IF EXISTS "costumer"');
    await queryRunner.query('DROP TABLE IF EXISTS "courier"');
    await queryRunner.query('DROP TABLE IF EXISTS "user"');
    await queryRunner.query('DROP TYPE IF EXISTS "processed_events_status_enum"');
    await queryRunner.query('DROP TYPE IF EXISTS "outbox_events_status_enum"');
  }
}
