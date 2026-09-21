import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm'

export enum LabStatus {
  LIBERADO = 'liberado',
  BLOQUEADO = 'bloqueado',
}

@Entity({ name: 'labs' })
@Unique('UQ_labs_name', ['name'])
@Unique('UQ_labs_subnet', ['subnet'])
export class Lab {
  @PrimaryGeneratedColumn('increment', { type: 'integer' })
  id!: number

  @Column({ type: 'varchar', length: 120 })
  name!: string

  @Column({ type: 'varchar', length: 80 })
  block!: string

  @Column({ type: 'cidr' })
  subnet!: string

  @Column({ type: 'enum', enum: LabStatus, enumName: 'lab_status', default: LabStatus.BLOQUEADO })
  status!: LabStatus

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date
}
