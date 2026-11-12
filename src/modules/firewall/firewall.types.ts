export type FirewallStatus = 'bloqueado' | 'liberado' | 'desconhecido'

export type FirewallObservation = {
  status: FirewallStatus
  error: { message: string; code: string } | null
}
