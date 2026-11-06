import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1700000001000 implements MigrationInterface {
  name = 'InitialSchema1700000001000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "auth_sessions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "email" character varying NOT NULL,
        "roles" jsonb NOT NULL,
        "ownerId" uuid,
        "courierId" uuid,
        "costumerId" uuid,
        "refreshTokenHash" character varying(64) NOT NULL,
        "expiresAt" timestamp(6) NOT NULL,
        "revokedAt" timestamp(6),
        "createdAt" timestamp(6) NOT NULL DEFAULT now(),
        "updatedAt" timestamp(6) NOT NULL DEFAULT now(),
        CONSTRAINT "PK_auth_sessions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_auth_sessions_refresh_token"
          UNIQUE ("refreshTokenHash")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_auth_sessions_userId"
        ON "auth_sessions" ("userId")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "auth_sessions"');
  }
}
