import type { Drop, FeedQuery, FeedResponse } from '@aux/shared'
import { AppError } from '../../errors.js'
import type { CatalogService } from '../catalog/index.js'
import type { IdentityService } from '../identity/index.js'
import { decodeCursor, encodeCursor } from './cursor.js'
import type { DropRepository, DropRow } from './repository.js'

type Deps = {
  repository: DropRepository
  catalog: Pick<CatalogService, 'getRecordings'>
  identity: Pick<IdentityService, 'getHandles'>
}

export function createDropService({ repository, catalog, identity }: Deps) {
  async function toDrops(rows: DropRow[]): Promise<Drop[]> {
    const [recordings, handles] = await Promise.all([
      catalog.getRecordings(rows.map((r) => r.recordingId)),
      identity.getHandles(rows.map((r) => r.userId))
    ])

    return rows.map((row) => {
      const recording = recordings.get(row.recordingId)
      const handle = handles.get(row.userId)
      if (!recording || !handle) throw new Error(`drop ${row.id} points at a missing recording or user`)
      return {
        id: row.id,
        curator: { handle },
        recording,
        note: row.note,
        saveCount: row.saveCount,
        createdAt: row.createdAt.toISOString()
      }
    })
  }

  return {
    // Every drop for now. Narrows to follows and taste neighbours once sign-in exists.
    async getFeed({ cursor, limit }: FeedQuery): Promise<FeedResponse> {
      const beforeId = cursor === undefined ? undefined : decodeCursor(cursor)
      // One extra row tells us whether another page exists.
      const rows = await repository.findFeed(beforeId, limit + 1)
      const page = rows.slice(0, limit)
      return {
        drops: await toDrops(page),
        nextCursor: rows.length > limit ? encodeCursor(page[page.length - 1].id) : null
      }
    },

    async getDrop(id: number): Promise<Drop> {
      const row = await repository.findById(id)
      if (!row) throw new AppError(404, 'DROP_NOT_FOUND', `Drop ${id} does not exist`)
      const [drop] = await toDrops([row])
      return drop
    }
  }
}

export type DropService = ReturnType<typeof createDropService>
