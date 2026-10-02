import type { db as Db } from '../../db/index.js'
import { createCatalogRepository } from './repository.js'
import { createCatalogService } from './service.js'

export type { CatalogService } from './service.js'

export const createCatalogModule = (db: typeof Db) => createCatalogService(createCatalogRepository(db))
