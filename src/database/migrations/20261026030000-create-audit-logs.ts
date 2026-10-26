import { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateAuditLogs20261026030000 implements MigrationInterface {
  name = 'CreateAuditLogs20261026030000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("CREATE TYPE \"audit_result\" AS ENUM ('SUCCESS', 'FAILURE')")
    await queryRunner.query(`
      CREATE TABLE "audit_logs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "actor_id" uuid NOT NULL,
        "actor_username_snapshot" varchar(64) NOT NULL,
        "action" varchar(80) NOT NULL,
        "resource_type" varchar(40) NOT NULL,
        "resource_id" varchar(64),
        "result" "audit_result" NOT NULL,
        "request_id" uuid,
        "details" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_audit_logs_actor" FOREIGN KEY ("actor_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT
      )
    `)
    await queryRunner.query('CREATE INDEX "IDX_audit_logs_created_at" ON "audit_logs" ("created_at")')
    await queryRunner.query('CREATE INDEX "IDX_audit_logs_actor_created_at" ON "audit_logs" ("actor_id", "created_at")')
    await queryRunner.query('CREATE INDEX "IDX_audit_logs_resource_created_at" ON "audit_logs" ("resource_type", "resource_id", "created_at")')
    await queryRunner.query('CREATE UNIQUE INDEX "UQ_audit_logs_request_action" ON "audit_logs" ("request_id", "action") WHERE "request_id" IS NOT NULL')
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "audit_logs"')
    await queryRunner.query('DROP TYPE "audit_result"')
  }
}
