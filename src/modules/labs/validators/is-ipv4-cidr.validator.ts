import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator'
import { validateIpv4Cidr } from '../../../common/network/ipv4-cidr'

export function IsIpv4Cidr(validationOptions?: ValidationOptions): PropertyDecorator {
  return (target, propertyName) => {
    registerDecorator({
      name: 'isIpv4Cidr',
      target: target.constructor,
      propertyName: propertyName.toString(),
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return validateIpv4Cidr(value).valid
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} must be a valid IPv4 address with a CIDR prefix from /0 to /32`
        },
      },
    })
  }
}
