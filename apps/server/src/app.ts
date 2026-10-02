import Fastify from 'fastify'
import { db, pool } from './db/index.js'
import { registerErrorHandlers } from './errors.js'
import { createCatalogModule } from './modules/catalog/index.js'
import { createDropsModule } from './modules/drops/index.js'
import { createIdentityModule } from './modules/identity/index.js'
import { redis } from './redis.js'

export function buildApp({ logger = true } = {}) {
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

  const catalog = createCatalogModule(db)
  const identity = createIdentityModule(db)
  createDropsModule({ db, catalog, identity }).register(app)

  return app
}
