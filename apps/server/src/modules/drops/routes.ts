import type { FastifyInstance } from 'fastify'
import { createDropSchema, dropParamsSchema, feedQuerySchema } from '@aux/shared'
import { AppError } from '../../errors.js'
import type { OptionalUser, RequireUser } from '../identity/index.js'
import type { DropService } from './service.js'

export function registerDropRoutes(
  app: FastifyInstance,
  service: DropService,
  requireUser: RequireUser,
  optionalUser: OptionalUser
) {
  const dropId = (params: unknown) => {
    const parsed = dropParamsSchema.safeParse(params)
    if (!parsed.success) throw new AppError(404, 'DROP_NOT_FOUND', 'Drop does not exist')
    return parsed.data.id
  }

  app.post('/drops', async (request, reply) => {
    const user = await requireUser(request)
    const body = createDropSchema.safeParse(request.body)
    if (!body.success) {
      throw new AppError(400, 'INVALID_BODY', 'Send a link and a note of 1 to 280 characters')
    }
    reply.code(201)
    return service.createDrop(user, body.data)
  })

  app.get('/feed', async (request) => {
    const query = feedQuerySchema.safeParse(request.query)
    if (!query.success) throw new AppError(400, 'INVALID_QUERY', 'limit must be between 1 and 50')
    const viewer = await optionalUser(request)
    return service.getFeed(query.data, viewer?.id)
  })

  app.get('/drops/:id', async (request) => {
    const id = dropId(request.params)
    const viewer = await optionalUser(request)
    return service.getDrop(id, viewer?.id)
  })

  // Both answer with the drop as it now stands, so the app can show the new count without asking again.
  app.post('/drops/:id/save', async (request) => {
    const user = await requireUser(request)
    return service.saveDrop(user, dropId(request.params))
  })

  app.delete('/drops/:id/save', async (request) => {
    const user = await requireUser(request)
    return service.unsaveDrop(user, dropId(request.params))
  })
}
