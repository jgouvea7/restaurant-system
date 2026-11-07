import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddQueryIndexes1700000002000 implements MigrationInterface {
  name = 'AddQueryIndexes1700000002000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "restaurant" ALTER COLUMN "createdAt" TYPE timestamp(3)',
    );
    await queryRunner.query(
      'ALTER TABLE "product" ALTER COLUMN "createdAt" TYPE timestamp(3)',
    );
    await queryRunner.query(
      'ALTER TABLE "orders" ALTER COLUMN "createdAt" TYPE timestamp(3)',
    );

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_orders_restaurant_created"
        ON "orders" ("restaurantId", "createdAt" DESC, "id" DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_orders_costumer_created"
        ON "orders" ("costumerUserId", "createdAt" DESC, "id" DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_orders_courier_created"
        ON "orders" ("courierId", "createdAt" DESC, "id" DESC)
        WHERE "courierId" IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_order_items_order"
        ON "order_items" ("order_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_product_restaurant_created"
        ON "product" ("restaurantId", "createdAt" DESC, "id" DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_restaurant_owner"
        ON "restaurant" ("ownerUserId")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_restaurant_owner"');
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_product_restaurant_created"',
    );
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_order_items_order"');
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_orders_courier_created"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_orders_costumer_created"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_orders_restaurant_created"',
    );

    await queryRunner.query(
      'ALTER TABLE "orders" ALTER COLUMN "createdAt" TYPE timestamp(6)',
    );
    await queryRunner.query(
      'ALTER TABLE "product" ALTER COLUMN "createdAt" TYPE timestamp(6)',
    );
    await queryRunner.query(
      'ALTER TABLE "restaurant" ALTER COLUMN "createdAt" TYPE timestamp(6)',
    );
  }
}
