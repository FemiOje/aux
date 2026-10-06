import { describe, expect, it } from 'vitest'
import type { ResolveResponse } from '@aux/shared'
import { AppError } from '../../errors.js'
import { decodeCursor, encodeCursor } from './cursor.js'
import type { DropRepository, DropRow } from './repository.js'
import { createDropService } from './service.js'

const row = (id: number): DropRow => ({
  id,
  userId: 1,
  recordingId: 7,
  note: `note ${id}`,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  saveCount: 2,
  saved: false
})

const reckoner = { id: 7, title: 'Reckoner', artist: 'Radiohead', durationMs: 290000, tracks: [] }

// Five drops, ids 5..1, served newest first like the real repository.
// savedIds are the drops user 1 saved, most recent first; a drop's save id is its place from the end, times 100.
function serviceOver(
  ids: number[],
  resolved: ResolveResponse = { recording: null, matches: [] },
  savedIds: number[] = []
) {
  const rows = ids.map(row)
  const savedRows = savedIds.map((id, i) => ({ ...row(id), saved: true, saveId: (savedIds.length - i) * 100 }))
  const repository: DropRepository = {
    findFeed: async (_viewerId, beforeId, limit) =>
      rows.filter((r) => beforeId === undefined || r.id < beforeId).slice(0, limit),
    findByCurator: async (curatorId, _viewerId, beforeId, limit) =>
      rows.filter((r) => r.userId === curatorId && (beforeId === undefined || r.id < beforeId)).slice(0, limit),
    findSaved: async (_userId, beforeSaveId, limit) =>
      savedRows.filter((r) => beforeSaveId === undefined || r.saveId < beforeSaveId).slice(0, limit),
    findById: async (id) => rows.find((r) => r.id === id),
    insert: async ({ recordingId, note }) => ({ ...row(100), recordingId, note, saveCount: 0 }),
    insertSave: async () => {
      throw new Error('not used')
    },
    deleteSave: async () => {
      throw new Error('not used')
    }
  }
  return createDropService({
    repository,
    catalog: {
      getRecordings: async () => new Map([[7, reckoner]]),
      resolveLink: async () => resolved
    },
    identity: {
      getHandles: async () => new Map([[1, 'femi']]),
      getUserId: async (handle) => {
        if (handle === 'femi') return 1
        if (handle === 'ada') return 2
        throw new AppError(404, 'USER_NOT_FOUND', 'nobody')
      }
    }
  })
}

describe('cursor', () => {
  it('round-trips an id', () => {
    expect(decodeCursor(encodeCursor(42))).toBe(42)
  })

  it.each(['', 'not-a-cursor', encodeCursor(1) + '!', Buffer.from('-3').toString('base64url')])(
    'rejects %j',
    (bad) => {
      expect(() => decodeCursor(bad)).toThrowError(expect.objectContaining({ code: 'INVALID_CURSOR' }))
    }
  )
})

describe('getFeed', () => {
  it('pages through every drop once, then stops', async () => {
    const service = serviceOver([5, 4, 3, 2, 1])
    const seen: number[] = []
    let cursor: string | undefined
    let pages = 0

    do {
      const page = await service.getFeed({ cursor, limit: 2 })
      seen.push(...page.drops.map((d) => d.id))
      cursor = page.nextCursor ?? undefined
      pages++
    } while (cursor)

    expect(seen).toEqual([5, 4, 3, 2, 1])
    expect(pages).toBe(3)
  })

  it('has no next cursor when the page exactly fits', async () => {
    const page = await serviceOver([2, 1]).getFeed({ limit: 2 })
    expect(page.drops).toHaveLength(2)
    expect(page.nextCursor).toBeNull()
  })

  it('shapes a drop like the API spec', async () => {
    const { drops } = await serviceOver([1]).getFeed({ limit: 20 })
    expect(drops[0]).toEqual({
      id: 1,
      curator: { handle: 'femi' },
      recording: { id: 7, title: 'Reckoner', artist: 'Radiohead', durationMs: 290000, tracks: [] },
      note: 'note 1',
      saveCount: 2,
      saved: false,
      createdAt: '2026-01-01T00:00:00.000Z'
    })
  })
})

describe('getSaved', () => {
  // Saved in an order unlike the drops' own, so paging by drop id would skip or repeat some.
  const savedIds = [2, 5, 1, 4, 3]

  it('pages through every saved drop once, in the order they were saved', async () => {
    const service = serviceOver([5, 4, 3, 2, 1], undefined, savedIds)
    const seen: number[] = []
    let cursor: string | undefined
    let pages = 0

    do {
      const page = await service.getSaved({ id: 1 }, { cursor, limit: 2 })
      seen.push(...page.drops.map((d) => d.id))
      cursor = page.nextCursor ?? undefined
      pages++
    } while (cursor)

    expect(seen).toEqual(savedIds)
    expect(pages).toBe(3)
  })

  it('has no next cursor when the page exactly fits', async () => {
    const page = await serviceOver([2, 1], undefined, [1, 2]).getSaved({ id: 1 }, { limit: 2 })
    expect(page.drops.map((d) => d.id)).toEqual([1, 2])
    expect(page.nextCursor).toBeNull()
  })

  it('is empty when nothing is saved', async () => {
    expect(await serviceOver([1]).getSaved({ id: 1 }, { limit: 20 })).toEqual({ drops: [], nextCursor: null })
  })
})

describe('getDropsBy', () => {
  it('pages through every drop of that person once, then stops', async () => {
    const service = serviceOver([5, 4, 3, 2, 1])
    const seen: number[] = []
    let cursor: string | undefined
    let pages = 0

    do {
      const page = await service.getDropsBy('femi', { cursor, limit: 2 })
      seen.push(...page.drops.map((d) => d.id))
      cursor = page.nextCursor ?? undefined
      pages++
    } while (cursor)

    expect(seen).toEqual([5, 4, 3, 2, 1])
    expect(pages).toBe(3)
  })

  it('is empty for someone who has not posted', async () => {
    expect(await serviceOver([2, 1]).getDropsBy('ada', { limit: 20 })).toEqual({ drops: [], nextCursor: null })
  })

  it('throws USER_NOT_FOUND for a handle nobody has', async () => {
    await expect(serviceOver([1]).getDropsBy('nobody', { limit: 20 })).rejects.toMatchObject({
      statusCode: 404,
      code: 'USER_NOT_FOUND'
    })
  })
})

describe('createDrop', () => {
  const femi = { id: 1, handle: 'femi' }

  it('uses the recording the link resolves to', async () => {
    const service = serviceOver([], { recording: reckoner, matches: [] })
    const drop = await service.createDrop(femi, { link: 'https://youtu.be/abc', note: 'from a link' })
    expect(drop).toMatchObject({ curator: { handle: 'femi' }, recording: reckoner, note: 'from a link', saveCount: 0 })
  })

  it('uses the recording the user picked, without resolving anything', async () => {
    // The stubbed resolver would answer "unclear", so a drop here proves it was never asked.
    const drop = await serviceOver([]).createDrop(femi, { recordingId: 7, note: 'picked' })
    expect(drop).toMatchObject({ curator: { handle: 'femi' }, recording: reckoner, note: 'picked' })
  })

  it('refuses a picked recording that is not in the catalog', async () => {
    await expect(serviceOver([]).createDrop(femi, { recordingId: 8, note: 'gone' })).rejects.toMatchObject({
      statusCode: 404,
      code: 'RECORDING_NOT_FOUND'
    })
  })

  it('refuses an unclear link even when there are close matches', async () => {
    const service = serviceOver([], { recording: null, matches: [reckoner] })
    await expect(service.createDrop(femi, { link: 'https://youtu.be/abc', note: 'which?' })).rejects.toMatchObject({
      statusCode: 422,
      code: 'RECORDING_UNCLEAR'
    })
  })
})

describe('getDrop', () => {
  it('throws DROP_NOT_FOUND for a missing drop', async () => {
    await expect(serviceOver([1]).getDrop(99)).rejects.toMatchObject({
      statusCode: 404,
      code: 'DROP_NOT_FOUND'
    })
  })
})
