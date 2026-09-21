import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator'

export function IsCanonicalIpv4Cidr(validationOptions?: ValidationOptions): PropertyDecorator {
  return (target, propertyName) => {
    registerDecorator({
      name: 'isCanonicalIpv4Cidr',
      target: target.constructor,
      propertyName: propertyName.toString(),
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && isCanonicalIpv4Cidr(value)
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} must be an IPv4 network in CIDR notation`
        },
      },
    })
  }
}

function isCanonicalIpv4Cidr(value: string): boolean {
  const [address, prefixText, ...rest] = value.split('/')

  if (rest.length > 0 || !address || !prefixText || !/^\d{1,2}$/.test(prefixText)) {
    return false
  }

  const prefix = Number(prefixText)
  const octets = address.split('.')

  if (prefix > 32 || octets.length !== 4 || octets.some((octet) => !/^(0|[1-9]\d{0,2})$/.test(octet))) {
    return false
  }

  const values = octets.map(Number)

  if (values.some((octet) => octet > 255)) {
    return false
  }

  const numericAddress = values.reduce((result, octet) => (result << 8) | octet, 0) >>> 0
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
  return (numericAddress & mask) >>> 0 === numericAddress
}
