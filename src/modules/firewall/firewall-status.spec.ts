import { readFirewallStatus } from './firewall-status'

const header = '-P FORWARD ACCEPT\n-A FORWARD -j LAB_GUARD\n-N LAB_GUARD'
const rule = '-A LAB_GUARD -s 10.1.0.0/24 -o eth0 -m comment --comment "labguard:12" -j REJECT --reject-with icmp-port-unreachable'

describe('readFirewallStatus', () => {
  it.each([
    { output: `${header}\n${rule}`, subnet: '10.1.0.0/24', status: 'bloqueado' },
    { output: `${header}\n${rule}`, subnet: '10.1.0.37/24', status: 'bloqueado' },
    { output: `${header}\n${rule}`, subnet: '10.1.0.5/32', status: 'bloqueado' },
    { output: `${header}\n${rule}`, subnet: '10.2.0.0/24', status: 'liberado' },
    { output: header, subnet: '10.1.0.0/24', status: 'liberado' },
    { output: '-P FORWARD ACCEPT', subnet: '10.1.0.0/24', status: 'liberado' },
    { output: `-P FORWARD ACCEPT\n-N LAB_GUARD\n${rule}`, subnet: '10.1.0.0/24', status: 'liberado' },
    { output: `${header}\n${rule.replace('eth0', 'eth1')}`, subnet: '10.1.0.0/24', status: 'liberado' },
    { output: `${header}\n${rule.replace('"labguard:12"', 'labguard:99')}`, subnet: '10.1.0.0/24', status: 'bloqueado' },
    { output: `${header}\n${rule.replace('10.1.0.0/24', '10.0.0.0/8')}`, subnet: '10.1.0.0/24', status: 'bloqueado' },
    { output: `${header}\n${rule.replace('10.1.0.0/24', '10.1.0.37')}`, subnet: '10.1.0.37/32', status: 'bloqueado' },
    { output: `${header}\n${rule.replace('10.1.0.0/24', '10.1.0.0/25')}`, subnet: '10.1.0.0/24', status: 'desconhecido' },
  ])('observes $status for $subnet in $output', ({ output, subnet, status }) => {
    expect(readFirewallStatus(output, subnet, 'eth0')).toBe(status)
  })

  it.each([
    '',
    'OK status',
    '-P FORWARD ACCEPT\n-A FORWARD -j LAB_GUARD',
    header.replace('ACCEPT', 'DROP'),
    `${header}\n-A FORWARD -j ACCEPT`,
    `${header}\n-A LAB_GUARD -j RETURN`,
    `${header}\n${rule.replace('10.1.0.0/24', '999.1.0.0/24')}`,
    `${header}\n${rule.replace(' -s ', ' ! -s ')}`,
    `${header}\n${rule.replace(' -j REJECT', ' -p tcp -j REJECT')}`,
    `${header}\n-N LAB_GUARD`,
  ])('returns unknown for incomplete or unsupported state: %s', (output) => {
    expect(readFirewallStatus(output, '10.1.0.0/24', 'eth0')).toBe('desconhecido')
  })
})
