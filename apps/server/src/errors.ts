import type { FastifyInstance } from 'fastify'
import type { ApiError } from '@aux/shared'

export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string
  ) {
    super(message)
  }
}

const body = (code: string, message: string): ApiError => ({ error: { code, message } })

// Every error leaves the API as { error: { code, message } }.
export function registerErrorHandlers(app: FastifyInstance) {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send(body(error.code, error.message))
    }
    const { statusCode, message } = error as { statusCode?: number; message?: string }
    if (statusCode && statusCode >= 400 && statusCode < 500) {
      return reply.status(statusCode).send(body('BAD_REQUEST', message ?? 'Bad request'))
    }
    request.log.error(error)
    return reply.status(500).send(body('INTERNAL', 'Something went wrong'))
  })

  app.setNotFoundHandler((request, reply) => {
    return reply.status(404).send(body('NOT_FOUND', `No route for ${request.method} ${request.url}`))
  })
}
