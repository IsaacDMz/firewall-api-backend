import { LabStatus } from '../../database/entities/lab.entity'
import { FirewallObservation } from '../firewall/firewall.types'

export type LabFirewallStatusResponse = {
  labId: number
  subnet: string
  databaseStatus: LabStatus
  firewallStatus: FirewallObservation['status']
  isSynchronized: boolean | null
  checkedAt: string
  error: FirewallObservation['error']
}

export type LabFirewallReconcileResponse = LabFirewallStatusResponse & {
  success: boolean
  changeApplied: boolean | null
}

export type LabResponse = {
  id: number
  name: string
  block: {
    id: string
    name: string
  }
  subnet: string
  status: LabStatus
}
