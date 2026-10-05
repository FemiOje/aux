import type { FastifyInstance } from 'fastify'
import type { db as Db } from '../../db/index.js'
import type { AuthPort } from '../../ports/auth.js'
import { createIdentityRepository } from './repository.js'
import { createOptionalUser, createRequireUser, registerIdentityRoutes } from './routes.js'
import { createIdentityService } from './service.js'

export type { OptionalUser, RequireUser } from './routes.js'
export type { IdentityService } from './service.js'

type Deps = { db: typeof Db; auth: AuthPort }

export function createIdentityModule({ db, auth }: Deps) {
  const service = createIdentityService(createIdentityRepository(db), auth)
  const requireUser = createRequireUser(service)
  const optionalUser = createOptionalUser(requireUser)
  return { service, requireUser, optionalUser, register: (app: FastifyInstance) => registerIdentityRoutes(app, service, requireUser) }
}
