import { and, desc, eq, exists, lt, sql } from 'drizzle-orm'
import type { db as Db } from '../../db/index.js'
import { drops, saves } from '../../db/schema.js'

export type DropRow = {
  id: number
  userId: number
  recordingId: number
  note: string
  createdAt: Date
  saveCount: number
  saved: boolean
}

// A drop someone saved. saveId orders the list and pages it.
export type SavedDropRow = DropRow & { saveId: number }

export function createDropRepository(db: typeof Db) {
  // viewerId is who is looking, so `saved` can say whether they saved the drop. Nobody signed in means false.
  const columns = (viewerId: number | undefined) => ({
    id: drops.id,
    userId: drops.userId,
    recordingId: drops.recordingId,
    note: drops.note,
    createdAt: drops.createdAt,
    saveCount: db.$count(saves, eq(saves.dropId, drops.id)),
    saved:
      viewerId === undefined
        ? sql<boolean>`false`
        : sql<boolean>`${exists(
            db
              .select({ one: sql`1` })
              .from(saves)
              .where(and(eq(saves.dropId, drops.id), eq(saves.userId, viewerId)))
          )}`
  })

  return {
    // Newest first. drop ids are increasing, so id order is creation order and is unique.
    async findFeed(viewerId: number | undefined, beforeId: number | undefined, limit: number): Promise<DropRow[]> {
      return db
        .select(columns(viewerId))
        .from(drops)
        .where(beforeId === undefined ? undefined : lt(drops.id, beforeId))
        .orderBy(desc(drops.id))
        .limit(limit)
    },

    // The drops this user saved, most recently saved first. save ids are increasing, so id order is save order.
    async findSaved(userId: number, beforeSaveId: number | undefined, limit: number): Promise<SavedDropRow[]> {
      return db
        .select({ ...columns(userId), saveId: saves.id })
        .from(saves)
        .innerJoin(drops, eq(drops.id, saves.dropId))
        .where(and(eq(saves.userId, userId), beforeSaveId === undefined ? undefined : lt(saves.id, beforeSaveId)))
        .orderBy(desc(saves.id))
        .limit(limit)
    },

    async findById(id: number, viewerId: number | undefined): Promise<DropRow | undefined> {
      const rows = await db.select(columns(viewerId)).from(drops).where(eq(drops.id, id))
      return rows.at(0)
    },

    async insert(values: { userId: number; recordingId: number; note: string }): Promise<DropRow> {
      const [row] = await db.insert(drops).values(values).returning()
      return { ...row, saveCount: 0, saved: false }
    },

    // Saving a drop you already saved changes nothing: (drop_id, user_id) is unique.
    async insertSave(dropId: number, userId: number) {
      await db.insert(saves).values({ dropId, userId }).onConflictDoNothing()
    },

    async deleteSave(dropId: number, userId: number) {
      await db.delete(saves).where(and(eq(saves.dropId, dropId), eq(saves.userId, userId)))
    }
  }
}

export type DropRepository = ReturnType<typeof createDropRepository>
