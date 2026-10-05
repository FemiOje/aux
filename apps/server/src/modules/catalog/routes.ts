import type { FastifyInstance } from 'fastify'
import { resolveRequestSchema } from '@aux/shared'
import { AppError } from '../../errors.js'
import type { CatalogService } from './service.js'

export function registerCatalogRoutes(app: FastifyInstance, service: CatalogService) {
  app.post('/catalog/resolve', async (request) => {
    const body = resolveRequestSchema.safeParse(request.body)
    if (!body.success) throw new AppError(400, 'INVALID_BODY', 'link must be a URL')
    return service.resolveLink(body.data.link)
  })
}
