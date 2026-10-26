import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm'
import { Block } from './block.entity'

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

  @Column({ name: 'block_id', type: 'uuid' })
  blockId!: string

  @ManyToOne(() => Block, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'block_id', foreignKeyConstraintName: 'FK_labs_block' })
  block!: Block

  @Column({ type: 'varchar', length: 18 })
  subnet!: string

  @Column({ type: 'enum', enum: LabStatus, enumName: 'lab_status', default: LabStatus.BLOQUEADO })
  status!: LabStatus

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date
}
