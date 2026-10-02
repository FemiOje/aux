import { desc, eq, lt } from 'drizzle-orm'
import type { db as Db } from '../../db/index.js'
import { drops, saves } from '../../db/schema.js'

export function createDropRepository(db: typeof Db) {
  const columns = {
    id: drops.id,
    userId: drops.userId,
    recordingId: drops.recordingId,
    note: drops.note,
    createdAt: drops.createdAt,
    saveCount: db.$count(saves, eq(saves.dropId, drops.id))
  }

  return {
    // Newest first. drop ids are increasing, so id order is creation order and is unique.
    async findFeed(beforeId: number | undefined, limit: number) {
      return db
        .select(columns)
        .from(drops)
        .where(beforeId === undefined ? undefined : lt(drops.id, beforeId))
        .orderBy(desc(drops.id))
        .limit(limit)
    },

    async findById(id: number) {
      const rows = await db.select(columns).from(drops).where(eq(drops.id, id))
      return rows.at(0)
    }
  }
}

export type DropRepository = ReturnType<typeof createDropRepository>
export type DropRow = Awaited<ReturnType<DropRepository['findFeed']>>[number]
