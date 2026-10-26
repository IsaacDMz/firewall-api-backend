import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

export enum AuditResult {
  SUCCESS = 'SUCCESS',
  FAILURE = 'FAILURE',
}

@Entity({ name: 'audit_logs' })
@Index('IDX_audit_logs_created_at', ['createdAt'])
@Index('IDX_audit_logs_actor_created_at', ['actorId', 'createdAt'])
@Index('IDX_audit_logs_resource_created_at', ['resourceType', 'resourceId', 'createdAt'])
@Index('UQ_audit_logs_request_action', ['requestId', 'action'], { unique: true, where: 'request_id IS NOT NULL' })
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'actor_id', type: 'uuid' })
  actorId!: string

  @Column({ name: 'actor_username_snapshot', type: 'varchar', length: 64 })
  actorUsernameSnapshot!: string

  @Column({ type: 'varchar', length: 80 })
  action!: string

  @Column({ name: 'resource_type', type: 'varchar', length: 40 })
  resourceType!: string

  @Column({ name: 'resource_id', type: 'varchar', length: 64, nullable: true })
  resourceId!: string | null

  @Column({ type: 'enum', enum: AuditResult, enumName: 'audit_result' })
  result!: AuditResult

  @Column({ name: 'request_id', type: 'uuid', nullable: true })
  requestId!: string | null

  @Column({ type: 'jsonb', default: () => "'{}'" })
  details!: Record<string, unknown>

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date
}
