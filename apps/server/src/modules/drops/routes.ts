import type { FastifyInstance } from 'fastify'
import { dropParamsSchema, feedQuerySchema } from '@aux/shared'
import { AppError } from '../../errors.js'
import type { DropService } from './service.js'

export function registerDropRoutes(app: FastifyInstance, service: DropService) {
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
