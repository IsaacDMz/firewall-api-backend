import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator'
import { validateCanonicalIpv4Network } from '../../../common/network/ipv4-cidr'

export function IsCanonicalIpv4Cidr(validationOptions?: ValidationOptions): PropertyDecorator {
  return (target, propertyName) => {
    registerDecorator({
      name: 'isCanonicalIpv4Cidr',
      target: target.constructor,
      propertyName: propertyName.toString(),
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return validateCanonicalIpv4Network(value).valid
        },
        defaultMessage(args: ValidationArguments): string {
          const result = validateCanonicalIpv4Network(args.value)
          const suggestion = !result.valid && result.suggestedSubnet ? `; use ${result.suggestedSubnet}` : ''
          return `${args.property} must be an IPv4 network in canonical CIDR notation with a prefix from /1 to /32${suggestion}`
        },
      },
    })
  }
}
