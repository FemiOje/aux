import type { db as Db } from '../../db/index.js'
import { createIdentityRepository } from './repository.js'
import { createIdentityService } from './service.js'

export type { IdentityService } from './service.js'

export const createIdentityModule = (db: typeof Db) => createIdentityService(createIdentityRepository(db))
