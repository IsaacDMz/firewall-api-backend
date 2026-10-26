import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { EntityManager, Repository } from 'typeorm'
import { AuditLog, AuditResult } from '../../database/entities/audit-log.entity'
import { AuditEvent } from './audit.types'

@Injectable()
export class AuditService {
  constructor(@InjectRepository(AuditLog) private readonly auditLogsRepository: Repository<AuditLog>) {}

  async record(event: AuditEvent): Promise<void> {
    await this.save(this.auditLogsRepository, event)
  }

  findAll(): Promise<AuditLog[]> {
    return this.auditLogsRepository.find({ order: { createdAt: 'DESC' } })
  }

  async recordInTransaction(manager: EntityManager, event: AuditEvent): Promise<void> {
    await this.save(manager.getRepository(AuditLog), event)
  }

  private async save(repository: Repository<AuditLog>, event: AuditEvent): Promise<void> {
    await repository.save(
      repository.create({
        actorId: event.actor.id,
        actorUsernameSnapshot: event.actor.username,
        action: event.action,
        resourceType: event.resourceType,
        resourceId: event.resourceId === undefined || event.resourceId === null ? null : String(event.resourceId),
        requestId: event.requestId ?? null,
        result: event.result ?? AuditResult.SUCCESS,
        details: event.details ?? {},
      }),
    )
  }
}
