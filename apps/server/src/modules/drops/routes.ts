import type { FastifyInstance } from 'fastify'
import { createDropSchema, dropParamsSchema, feedQuerySchema } from '@aux/shared'
import { AppError } from '../../errors.js'
import type { RequireUser } from '../identity/index.js'
import type { DropService } from './service.js'

export function registerDropRoutes(app: FastifyInstance, service: DropService, requireUser: RequireUser) {
  app.post('/drops', async (request, reply) => {
    const user = await requireUser(request)
    const body = createDropSchema.safeParse(request.body)
    if (!body.success) throw new AppError(400, 'INVALID_BODY', 'Send a link and a note of 1 to 280 characters')
    reply.code(201)
    return service.createDrop(user, body.data)
  })

  app.get('/feed', async (request) => {
    const query = feedQuerySchema.safeParse(request.query)
    if (!query.success) throw new AppError(400, 'INVALID_QUERY', 'limit must be between 1 and 50')
    return service.getFeed(query.data)
  })

  app.get('/drops/:id', async (request) => {
    const params = dropParamsSchema.safeParse(request.params)
    if (!params.success) throw new AppError(404, 'DROP_NOT_FOUND', 'Drop does not exist')
    return service.getDrop(params.data.id)
  })
}
