import type { CreateDrop, Drop, FeedQuery, FeedResponse, Me, Recording } from '@aux/shared'
import { AppError } from '../../errors.js'
import type { CatalogService } from '../catalog/index.js'
import type { IdentityService } from '../identity/index.js'
import { decodeCursor, encodeCursor } from './cursor.js'
import type { DropRepository, DropRow } from './repository.js'

type Deps = {
  repository: DropRepository
  catalog: Pick<CatalogService, 'getRecordings' | 'resolveLink'>
  identity: Pick<IdentityService, 'getHandles' | 'getUserId'>
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
        saved: row.saved,
        createdAt: row.createdAt.toISOString()
      }
    })
  }

  // viewerId is the signed-in user asking, if any. It decides each drop's `saved`.
  async function getDrop(id: number, viewerId?: number): Promise<Drop> {
    const row = await repository.findById(id, viewerId)
    if (!row) throw new AppError(404, 'DROP_NOT_FOUND', `Drop ${id} does not exist`)
    const [drop] = await toDrops([row])
    return drop
  }

  // The song a new drop is about: the one the link resolves to, or the one the user picked.
  async function findRecording(input: CreateDrop): Promise<Recording> {
    if ('recordingId' in input) {
      const recording = (await catalog.getRecordings([input.recordingId])).get(input.recordingId)
      if (!recording) throw new AppError(404, 'RECORDING_NOT_FOUND', `Recording ${input.recordingId} does not exist`)
      return recording
    }
    const { recording } = await catalog.resolveLink(input.link)
    // The link could be several songs and we won't guess. The app shows the close matches from
    // POST /catalog/resolve and posts again with the recording the user picked.
    if (!recording) throw new AppError(422, 'RECORDING_UNCLEAR', "We couldn't tell which song that link is")
    return recording
  }

  return {
    // Posting the same song again is allowed; each drop carries its own note.
    async createDrop(curator: Pick<Me, 'id' | 'handle'>, input: CreateDrop): Promise<Drop> {
      const recording = await findRecording(input)
      const row = await repository.insert({ userId: curator.id, recordingId: recording.id, note: input.note })
      return {
        id: row.id,
        curator: { handle: curator.handle },
        recording,
        note: row.note,
        saveCount: row.saveCount,
        saved: row.saved,
        createdAt: row.createdAt.toISOString()
      }
    },

    // Every drop for now. Narrows to follows and taste neighbours once sign-in exists.
    async getFeed({ cursor, limit }: FeedQuery, viewerId?: number): Promise<FeedResponse> {
      const beforeId = cursor === undefined ? undefined : decodeCursor(cursor)
      // One extra row tells us whether another page exists.
      const rows = await repository.findFeed(viewerId, beforeId, limit + 1)
      const page = rows.slice(0, limit)
      return {
        drops: await toDrops(page),
        nextCursor: rows.length > limit ? encodeCursor(page[page.length - 1].id) : null
      }
    },

    getDrop,

    // The drops this person posted, newest first. Pages like the feed. 404 USER_NOT_FOUND when nobody has the handle.
    async getDropsBy(handle: string, { cursor, limit }: FeedQuery, viewerId?: number): Promise<FeedResponse> {
      const beforeId = cursor === undefined ? undefined : decodeCursor(cursor)
      const curatorId = await identity.getUserId(handle)
      const rows = await repository.findByCurator(curatorId, viewerId, beforeId, limit + 1)
      const page = rows.slice(0, limit)
      return {
        drops: await toDrops(page),
        nextCursor: rows.length > limit ? encodeCursor(page[page.length - 1].id) : null
      }
    },

    // The drops this user saved, most recently saved first. The cursor is a save, not a drop.
    async getSaved(user: Pick<Me, 'id'>, { cursor, limit }: FeedQuery): Promise<FeedResponse> {
      const beforeSaveId = cursor === undefined ? undefined : decodeCursor(cursor)
      const rows = await repository.findSaved(user.id, beforeSaveId, limit + 1)
      const page = rows.slice(0, limit)
      return {
        drops: await toDrops(page),
        nextCursor: rows.length > limit ? encodeCursor(page[page.length - 1].saveId) : null
      }
    },

    // Saving twice is fine and counts once. Answers with the drop as the saver now sees it.
    async saveDrop(user: Pick<Me, 'id'>, dropId: number): Promise<Drop> {
      const row = await repository.findById(dropId, user.id)
      if (!row) throw new AppError(404, 'DROP_NOT_FOUND', `Drop ${dropId} does not exist`)
      await repository.insertSave(dropId, user.id)
      return getDrop(dropId, user.id)
    },

    // Unsaving a drop you never saved is not an error.
    async unsaveDrop(user: Pick<Me, 'id'>, dropId: number): Promise<Drop> {
      await repository.deleteSave(dropId, user.id)
      return getDrop(dropId, user.id)
    }
  }
}

export type DropService = ReturnType<typeof createDropService>
