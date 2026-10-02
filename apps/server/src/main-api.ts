import { buildApp } from './app.js'
import { redis } from './redis.js'

const app = buildApp()

const start = async () => {
  try {
    await redis.connect()
    await app.listen({ port: Number(process.env.PORT ?? 3000) })
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}
start()
