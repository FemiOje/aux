import type { FastifyInstance, FastifyRequest } from 'fastify'
import { sessionRequestSchema, type Me } from '@aux/shared'
import { AppError } from '../../errors.js'
import type { IdentityService } from './service.js'

export type RequireUser = (request: FastifyRequest) => Promise<Me>

// Any signed-in route starts with `const user = await requireUser(request)`.
export function createRequireUser(service: IdentityService): RequireUser {
  return async (request) => {
    const match = /^Bearer (\S+)$/.exec(request.headers.authorization ?? '')
    const user = match && (await service.authenticate(match[1]))
    if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Sign in to continue')
    return user
  }
}

export function registerIdentityRoutes(app: FastifyInstance, service: IdentityService, requireUser: RequireUser) {
  app.post('/auth/session', async (request) => {
    const body = sessionRequestSchema.safeParse(request.body)
    if (!body.success) throw new AppError(400, 'INVALID_BODY', 'token is required')
    return service.signIn(body.data.token)
  })

  app.get('/me', async (request) => requireUser(request))
}
