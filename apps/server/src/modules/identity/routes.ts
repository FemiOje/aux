import type { FastifyInstance, FastifyRequest } from 'fastify'
import { sessionRequestSchema, type Me } from '@aux/shared'
import { AppError } from '../../errors.js'
import type { IdentityService } from './service.js'

export type RequireUser = (request: FastifyRequest) => Promise<Me>
export type OptionalUser = (request: FastifyRequest) => Promise<Me | null>

const bearerToken = (request: FastifyRequest) => /^Bearer (\S+)$/.exec(request.headers.authorization ?? '')?.[1]

// Any signed-in route starts with `const user = await requireUser(request)`.
export function createRequireUser(service: IdentityService): RequireUser {
  return async (request) => {
    const token = bearerToken(request)
    const user = token && (await service.authenticate(token))
    if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Sign in to continue')
    return user
  }
}

// For routes that work signed out but answer differently for a signed-in user.
// A token that is sent has to be good: a session that ran out gets a 401, so the app knows to renew it.
export function createOptionalUser(requireUser: RequireUser): OptionalUser {
  return async (request) => (request.headers.authorization === undefined ? null : requireUser(request))
}

export function registerIdentityRoutes(app: FastifyInstance, service: IdentityService, requireUser: RequireUser) {
  app.post('/auth/session', async (request) => {
    const body = sessionRequestSchema.safeParse(request.body)
    if (!body.success) throw new AppError(400, 'INVALID_BODY', 'token is required')
    return service.signIn(body.data.token)
  })

  // Signing out twice, or with a session that already ran out, is not an error.
  app.delete('/auth/session', async (request, reply) => {
    const token = bearerToken(request)
    if (!token) throw new AppError(401, 'UNAUTHENTICATED', 'Sign in to continue')
    await service.signOut(token)
    reply.code(204)
  })

  app.get('/me', async (request) => requireUser(request))
}
