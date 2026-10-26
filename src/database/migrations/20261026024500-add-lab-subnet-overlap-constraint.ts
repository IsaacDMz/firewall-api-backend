import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddLabSubnetOverlapConstraint20261026024500 implements MigrationInterface {
  name = 'AddLabSubnetOverlapConstraint20261026024500'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE
        conflicting_labs record;
        invalid_lab record;
      BEGIN
        SELECT "id", "subnet" INTO invalid_lab
        FROM "labs"
        WHERE family("subnet") <> 4
        LIMIT 1;

        IF FOUND THEN
          RAISE EXCEPTION 'Cannot add IPv4 subnet constraint: lab % has non-IPv4 subnet %', invalid_lab.id, invalid_lab.subnet;
        END IF;

        SELECT first_lab."id" AS first_id, first_lab."subnet" AS first_subnet, second_lab."id" AS second_id, second_lab."subnet" AS second_subnet
        INTO conflicting_labs
        FROM "labs" AS first_lab
        JOIN "labs" AS second_lab ON first_lab."id" < second_lab."id" AND first_lab."subnet" && second_lab."subnet"
        LIMIT 1;

        IF FOUND THEN
          RAISE EXCEPTION 'Cannot add subnet overlap constraint: lab % (%) conflicts with lab % (%)', conflicting_labs.first_id, conflicting_labs.first_subnet, conflicting_labs.second_id, conflicting_labs.second_subnet;
        END IF;
      END $$;
    `)
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "btree_gist"')
    await queryRunner.query('ALTER TABLE "labs" ADD CONSTRAINT "CHK_labs_subnet_ipv4" CHECK (family("subnet") = 4)')
    await queryRunner.query('ALTER TABLE "labs" ADD CONSTRAINT "EX_labs_subnet_no_overlap" EXCLUDE USING gist ("subnet" inet_ops WITH &&)')
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "labs" DROP CONSTRAINT "EX_labs_subnet_no_overlap"')
    await queryRunner.query('ALTER TABLE "labs" DROP CONSTRAINT "CHK_labs_subnet_ipv4"')
  }
}
