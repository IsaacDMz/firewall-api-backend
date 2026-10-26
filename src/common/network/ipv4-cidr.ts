export type Ipv4CidrValidation = { valid: true } | { valid: false; suggestedSubnet?: string }

export function validateCanonicalIpv4Network(value: unknown): Ipv4CidrValidation {
  if (typeof value !== 'string') {
    return { valid: false }
  }

  const match = /^(?<address>(?:0|[1-9]\d{0,2})(?:\.(?:0|[1-9]\d{0,2})){3})\/(?<prefix>0|[1-9]|[12]\d|3[0-2])$/.exec(value)

  if (!match?.groups) {
    return { valid: false }
  }

  const octets = match.groups.address.split('.').map(Number)

  if (octets.some((octet) => octet > 255)) {
    return { valid: false }
  }

  const prefix = Number(match.groups.prefix)

  if (prefix === 0) {
    return { valid: false }
  }

  const address = octets.reduce((result, octet) => (result << 8) | octet, 0) >>> 0
  const mask = prefix === 32 ? 0xffffffff : (0xffffffff << (32 - prefix)) >>> 0
  const network = (address & mask) >>> 0

  if (address !== network) {
    return { valid: false, suggestedSubnet: `${toIpv4(network)}/${prefix}` }
  }

  return { valid: true }
}

function toIpv4(value: number): string {
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join('.')
}
