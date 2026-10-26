import { randomUUID } from 'crypto'
import { Injectable, NestMiddleware } from '@nestjs/common'
import { NextFunction, Request, Response } from 'express'

type RequestWithId = Request & { requestId?: string }

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: RequestWithId, response: Response, next: NextFunction): void {
    const suppliedId = request.header('x-request-id')
    request.requestId = suppliedId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(suppliedId) ? suppliedId : randomUUID()
    response.setHeader('X-Request-Id', request.requestId)
    next()
  }
}
