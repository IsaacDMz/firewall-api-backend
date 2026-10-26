import { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateBlocks20261026023000 implements MigrationInterface {
  name = 'CreateBlocks20261026023000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "blocks" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" varchar(80) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_blocks_name" UNIQUE ("name")
      )
    `)
    await queryRunner.query('INSERT INTO "blocks" ("name") SELECT DISTINCT "block" FROM "labs"')
    await queryRunner.query('ALTER TABLE "labs" ADD COLUMN "block_id" uuid')
    await queryRunner.query('UPDATE "labs" AS "lab" SET "block_id" = "blocks"."id" FROM "blocks" WHERE "blocks"."name" = "lab"."block"')
    await queryRunner.query('ALTER TABLE "labs" ALTER COLUMN "block_id" SET NOT NULL')
    await queryRunner.query('ALTER TABLE "labs" ADD CONSTRAINT "FK_labs_block" FOREIGN KEY ("block_id") REFERENCES "blocks" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT')
    await queryRunner.query('CREATE INDEX "IDX_labs_block_id" ON "labs" ("block_id")')
    await queryRunner.query('ALTER TABLE "labs" DROP COLUMN "block"')
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "labs" ADD COLUMN "block" varchar(80)')
    await queryRunner.query('UPDATE "labs" AS "lab" SET "block" = "blocks"."name" FROM "blocks" WHERE "blocks"."id" = "lab"."block_id"')
    await queryRunner.query('ALTER TABLE "labs" ALTER COLUMN "block" SET NOT NULL')
    await queryRunner.query('DROP INDEX "IDX_labs_block_id"')
    await queryRunner.query('ALTER TABLE "labs" DROP CONSTRAINT "FK_labs_block"')
    await queryRunner.query('ALTER TABLE "labs" DROP COLUMN "block_id"')
    await queryRunner.query('DROP TABLE "blocks"')
  }
}
