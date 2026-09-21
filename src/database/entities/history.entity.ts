import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm'
import { Lab, LabStatus } from './lab.entity'
import { User } from './user.entity'

export enum HistoryAction {
  BLOCK_INTERNET = 'BLOCK_INTERNET',
  UNBLOCK_INTERNET = 'UNBLOCK_INTERNET',
}

@Entity({ name: 'histories' })
@Index('IDX_histories_user_created_at', ['userId', 'createdAt'])
@Index('IDX_histories_lab_created_at', ['labId', 'createdAt'])
@Index('IDX_histories_request_id', ['requestId'], { where: 'request_id IS NOT NULL' })
export class History {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string

  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT', onUpdate: 'RESTRICT' })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'FK_histories_user' })
  user!: User

  @Column({ name: 'username_snapshot', type: 'varchar', length: 64 })
  usernameSnapshot!: string

  @Column({ name: 'lab_id', type: 'integer' })
  labId!: number

  @ManyToOne(() => Lab, { nullable: false, onDelete: 'RESTRICT', onUpdate: 'RESTRICT' })
  @JoinColumn({ name: 'lab_id', foreignKeyConstraintName: 'FK_histories_lab' })
  lab!: Lab

  @Column({ name: 'lab_name_snapshot', type: 'varchar', length: 120 })
  labNameSnapshot!: string

  @Column({ type: 'enum', enum: HistoryAction, enumName: 'history_action' })
  action!: HistoryAction

  @Column({ name: 'previous_status', type: 'enum', enum: LabStatus, enumName: 'lab_status' })
  previousStatus!: LabStatus

  @Column({ name: 'new_status', type: 'enum', enum: LabStatus, enumName: 'lab_status' })
  newStatus!: LabStatus

  @Column({ name: 'request_id', type: 'uuid', nullable: true })
  requestId!: string | null

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date
}
