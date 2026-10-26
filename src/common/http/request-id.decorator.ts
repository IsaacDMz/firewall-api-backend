import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { Request } from 'express'

type RequestWithId = Request & { requestId: string }

export const RequestId = createParamDecorator((_data: unknown, context: ExecutionContext): string => {
  return context.switchToHttp().getRequest<RequestWithId>().requestId
})
