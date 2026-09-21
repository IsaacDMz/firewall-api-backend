import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common'
import { Response } from 'express'

type ErrorResponse = {
  code?: string
  message?: string | string[]
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>()
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR
    const error = exception instanceof HttpException ? exception.getResponse() : undefined
    const body = typeof error === 'string' ? { message: error } : (error as ErrorResponse | undefined)

    response.status(status).json({
      message: Array.isArray(body?.message) ? body.message.join(', ') : (body?.message ?? 'Internal server error'),
      code: body?.code ?? HttpStatus[status] ?? 'INTERNAL_SERVER_ERROR',
    })
  }
}
