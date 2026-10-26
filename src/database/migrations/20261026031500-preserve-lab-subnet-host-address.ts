import { MigrationInterface, QueryRunner } from 'typeorm'

export class PreserveLabSubnetHostAddress20261026031500 implements MigrationInterface {
  name = 'PreserveLabSubnetHostAddress20261026031500'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "labs" DROP CONSTRAINT "EX_labs_subnet_no_overlap"')
    await queryRunner.query('ALTER TABLE "labs" DROP CONSTRAINT "CHK_labs_subnet_ipv4"')
    await queryRunner.query('ALTER TABLE "labs" ALTER COLUMN "subnet" TYPE varchar(18) USING "subnet"::text')
    await queryRunner.query('ALTER TABLE "labs" ADD CONSTRAINT "CHK_labs_subnet_ipv4" CHECK (family("subnet"::cidr) = 4)')
    await queryRunner.query('ALTER TABLE "labs" ADD CONSTRAINT "EX_labs_subnet_no_overlap" EXCLUDE USING gist (("subnet"::cidr) inet_ops WITH &&)')
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "labs" DROP CONSTRAINT "EX_labs_subnet_no_overlap"')
    await queryRunner.query('ALTER TABLE "labs" DROP CONSTRAINT "CHK_labs_subnet_ipv4"')
    await queryRunner.query('ALTER TABLE "labs" ALTER COLUMN "subnet" TYPE cidr USING "subnet"::cidr')
    await queryRunner.query('ALTER TABLE "labs" ADD CONSTRAINT "CHK_labs_subnet_ipv4" CHECK (family("subnet") = 4)')
    await queryRunner.query('ALTER TABLE "labs" ADD CONSTRAINT "EX_labs_subnet_no_overlap" EXCLUDE USING gist ("subnet" inet_ops WITH &&)')
  }
}
