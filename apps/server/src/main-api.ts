import Fastify from 'fastify'
import { pool } from './db/index.js'
import { redis } from './redis.js'

const app = Fastify({
  logger: true
})

app.get('/', async (request, reply) => {
  return { hello: 'world' }
})

app.get('/db', async (request, reply) => {
  const { rows } = await pool.query('SELECT now()')
  return { now: rows[0].now }
})

app.get('/redis', async (request, reply) => {
  return { pong: await redis.ping() }
})


const start = async () => {
  try {
    await redis.connect()
    await app.listen({ port: 3000 })
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}
start()
