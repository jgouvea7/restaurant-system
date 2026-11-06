import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1700000001000 implements MigrationInterface {
  name = 'InitialSchema1700000001000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "payments_status_enum" AS ENUM ('approved', 'rejected');
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
      CREATE TABLE IF NOT EXISTS "payments" (
        "paymentId" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "orderId" uuid NOT NULL,
        "amount" numeric(10,2) NOT NULL,
        "method" character varying NOT NULL,
        "status" "payments_status_enum" NOT NULL,
        "reason" character varying,
        "createdAt" timestamp(6) NOT NULL DEFAULT now(),
        "updatedAt" timestamp(6) NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payments" PRIMARY KEY ("paymentId"),
        CONSTRAINT "UQ_payments_order" UNIQUE ("orderId")
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
    await queryRunner.query('DROP TABLE IF EXISTS "payments"');
    await queryRunner.query('DROP TYPE IF EXISTS "processed_events_status_enum"');
    await queryRunner.query('DROP TYPE IF EXISTS "outbox_events_status_enum"');
    await queryRunner.query('DROP TYPE IF EXISTS "payments_status_enum"');
  }
}
