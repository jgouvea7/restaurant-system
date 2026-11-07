import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddQueryIndexes1700000002000 implements MigrationInterface {
  name = 'AddQueryIndexes1700000002000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "user" ALTER COLUMN "createdAt" TYPE timestamp(3)',
    );
    await queryRunner.query(
      'ALTER TABLE "owner" ALTER COLUMN "createdAt" TYPE timestamp(3)',
    );

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_user_created_at"
        ON "user" ("createdAt" DESC, "id" DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_address_costumer"
        ON "address" ("costumer_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_courier_reserved_order"
        ON "courier" ("reservedForOrderId")
        WHERE "reservedForOrderId" IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_owner_created_at"
        ON "owner" ("createdAt" DESC, "id" DESC)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_owner_created_at"');
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_courier_reserved_order"',
    );
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_address_costumer"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_user_created_at"');

    await queryRunner.query(
      'ALTER TABLE "owner" ALTER COLUMN "createdAt" TYPE timestamp(6)',
    );
    await queryRunner.query(
      'ALTER TABLE "user" ALTER COLUMN "createdAt" TYPE timestamp(6)',
    );
  }
}
