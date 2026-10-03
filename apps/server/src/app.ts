import Fastify from 'fastify'
import { PrivyVerifier } from './adapters/privy/verifier.js'
import { YouTubeResolver } from './adapters/youtube/resolver.js'
import { db, pool } from './db/index.js'
import { registerErrorHandlers } from './errors.js'
import { createCatalogModule } from './modules/catalog/index.js'
import { createDropsModule } from './modules/drops/index.js'
import { createIdentityModule } from './modules/identity/index.js'
import type { AuthPort } from './ports/auth.js'
import type { ResolvePort } from './ports/resolve.js'
import { redis } from './redis.js'

type Options = { logger?: boolean; resolvers?: ResolvePort[]; auth?: AuthPort }

export function buildApp({
  logger = true,
  resolvers = [new YouTubeResolver()],
  auth = new PrivyVerifier()
}: Options = {}) {
  const app = Fastify({ logger })

  registerErrorHandlers(app)

  app.get('/', async () => {
    return { hello: 'world' }
  })

  app.get('/db', async () => {
    const { rows } = await pool.query('SELECT now()')
    return { now: rows[0].now }
  })

  app.get('/redis', async () => {
    return { pong: await redis.ping() }
  })

  const catalog = createCatalogModule({ db, resolvers })
  const identity = createIdentityModule({ db, auth })
  catalog.register(app)
  identity.register(app)
  createDropsModule({
    db,
    catalog: catalog.service,
    identity: identity.service,
    requireUser: identity.requireUser
  }).register(app)

  return app
}
