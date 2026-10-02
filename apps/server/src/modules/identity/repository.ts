import { inArray } from 'drizzle-orm'
import type { db as Db } from '../../db/index.js'
import { users } from '../../db/schema.js'

export function createIdentityRepository(db: typeof Db) {
  return {
    async findHandlesByIds(ids: number[]) {
      if (ids.length === 0) return []
      return db.select({ id: users.id, handle: users.handle }).from(users).where(inArray(users.id, ids))
    }
  }
}

export type IdentityRepository = ReturnType<typeof createIdentityRepository>
