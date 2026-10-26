export type Ipv4CidrValidation = { valid: true } | { valid: false }

export function validateIpv4Cidr(value: unknown): Ipv4CidrValidation {
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

  return { valid: true }
}
