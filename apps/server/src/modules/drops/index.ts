import type { FastifyInstance } from 'fastify'
import type { db as Db } from '../../db/index.js'
import type { CatalogService } from '../catalog/index.js'
import type { IdentityService, RequireUser } from '../identity/index.js'
import { createDropRepository } from './repository.js'
import { registerDropRoutes } from './routes.js'
import { createDropService } from './service.js'

export type { DropService } from './service.js'

type Deps = { db: typeof Db; catalog: CatalogService; identity: IdentityService; requireUser: RequireUser }

export function createDropsModule({ db, catalog, identity, requireUser }: Deps) {
  const service = createDropService({ repository: createDropRepository(db), catalog, identity })
  return { service, register: (app: FastifyInstance) => registerDropRoutes(app, service, requireUser) }
}
