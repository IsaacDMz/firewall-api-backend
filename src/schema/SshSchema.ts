import * as Joi from 'joi'

export class SshSchema {
  static command = Joi.string().messages({
    'string.empty': 'Command deve ser uma string',
    'any.required': 'Command é um campo obrigatório',
  })
}
