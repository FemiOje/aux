import type { FastifyInstance } from 'fastify'
import type { db as Db } from '../../db/index.js'
import type { ResolvePort } from '../../ports/resolve.js'
import { createCatalogRepository } from './repository.js'
import { registerCatalogRoutes } from './routes.js'
import { createCatalogService } from './service.js'

export type { CatalogService } from './service.js'

type Deps = { db: typeof Db; resolvers: ResolvePort[] }

export function createCatalogModule({ db, resolvers }: Deps) {
  const service = createCatalogService(createCatalogRepository(db), resolvers)
  return { service, register: (app: FastifyInstance) => registerCatalogRoutes(app, service) }
}
