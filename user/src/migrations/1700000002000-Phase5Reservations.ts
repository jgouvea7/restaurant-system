import { MigrationInterface, QueryRunner } from 'typeorm';

export class Phase5Reservations1700000002000 implements MigrationInterface {
  name = 'Phase5Reservations1700000002000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "courier" ADD COLUMN IF NOT EXISTS "reservationStatus" character varying',
    );
    await queryRunner.query(
      'ALTER TABLE "courier" ADD COLUMN IF NOT EXISTS "reservationExpiresAt" timestamp(6)',
    );

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_courier_reservation_expiry"
        ON "courier" ("reservationStatus", "reservationExpiresAt")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_outbox_events_published_at"
        ON "outbox_events" ("status", "publishedAt")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_processed_events_processed_at"
        ON "processed_events" ("status", "processedAt")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_processed_events_processed_at"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_outbox_events_published_at"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_courier_reservation_expiry"',
    );
    await queryRunner.query(
      'ALTER TABLE "courier" DROP COLUMN IF EXISTS "reservationExpiresAt"',
    );
    await queryRunner.query(
      'ALTER TABLE "courier" DROP COLUMN IF EXISTS "reservationStatus"',
    );
  }
}
