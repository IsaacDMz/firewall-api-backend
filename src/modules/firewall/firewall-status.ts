import { validateIpv4Cidr } from '../../common/network/ipv4-cidr'
import { FirewallStatus } from './firewall.types'

function subnetRange(subnet: string): { start: number; end: number } | null {
  if (!validateIpv4Cidr(subnet).valid) return null

  const [address, prefix] = subnet.split('/')
  const value = address.split('.').reduce((result, octet) => result * 256 + Number(octet), 0)
  const size = 2 ** (32 - Number(prefix))
  const start = Math.floor(value / size) * size
  return { start, end: start + size - 1 }
}

// Interpret only the topology managed by the remote executor. Other policies or
// rules may change packet traversal, so they cannot safely imply Internet access.
export function readFirewallStatus(output: string, subnet: string, wanInterface: string): FirewallStatus {
  const requested = subnetRange(subnet)
  if (!requested) return 'desconhecido'

  const lines = output.trim().split(/\r?\n/)
  if (lines.filter((line) => line === '-P FORWARD ACCEPT').length !== 1) return 'desconhecido'

  const forwarding = lines.filter((line) => line.startsWith('-A FORWARD '))
  if (forwarding.length > 1 || forwarding.some((line) => line !== '-A FORWARD -j LAB_GUARD')) return 'desconhecido'

  const chainCount = lines.filter((line) => line === '-N LAB_GUARD').length
  if (chainCount > 1 || (forwarding.length === 1 && chainCount !== 1)) return 'desconhecido'

  let blocked = false
  let partialBlock = false
  for (const line of lines) {
    if (line === '-P FORWARD ACCEPT' || line === '-N LAB_GUARD' || line === '-A FORWARD -j LAB_GUARD') continue

    const rule = /^-A LAB_GUARD -s ([\d.]+(?:\/\d+)?) -o ([A-Za-z0-9_.:-]+) -m comment --comment (?:"labguard:[1-9]\d*"|labguard:[1-9]\d*) -j REJECT(?: --reject-with icmp-port-unreachable)?$/.exec(
      line,
    )
    if (!rule || chainCount !== 1) return 'desconhecido'

    const source = subnetRange(rule[1].includes('/') ? rule[1] : `${rule[1]}/32`)
    if (!source) return 'desconhecido'
    if (rule[2] !== wanInterface) continue

    // The subnet determines the actual effect; a stale lab ID comment must not
    // hide a rule that still blocks this lab's traffic.
    if (source.start <= requested.start && source.end >= requested.end) blocked = true
    else if (source.start <= requested.end && source.end >= requested.start) partialBlock = true
  }

  if (forwarding.length === 0) return 'liberado'
  if (blocked) return 'bloqueado'
  return partialBlock ? 'desconhecido' : 'liberado'
}
