import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface'
import { AuditResult } from '../../database/entities/audit-log.entity'

export type AuditEvent = {
  actor: AuthenticatedUser
  action: string
  resourceType: 'USER' | 'BLOCK' | 'LAB'
  resourceId?: string | number | null
  requestId?: string | null
  result?: AuditResult
  details?: Record<string, unknown>
}
