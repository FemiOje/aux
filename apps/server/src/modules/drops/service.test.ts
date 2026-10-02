import { describe, expect, it } from 'vitest'
import { decodeCursor, encodeCursor } from './cursor.js'
import type { DropRepository, DropRow } from './repository.js'
import { createDropService } from './service.js'

const row = (id: number): DropRow => ({
  id,
  userId: 1,
  recordingId: 7,
  note: `note ${id}`,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  saveCount: 2
})

// Five drops, ids 5..1, served newest first like the real repository.
function serviceOver(ids: number[]) {
  const rows = ids.map(row)
  const repository: DropRepository = {
    findFeed: async (beforeId, limit) =>
      rows.filter((r) => beforeId === undefined || r.id < beforeId).slice(0, limit),
    findById: async (id) => rows.find((r) => r.id === id)
  }
  return createDropService({
    repository,
    catalog: {
      getRecordings: async () =>
        new Map([[7, { id: 7, title: 'Reckoner', artist: 'Radiohead', durationMs: 290000, tracks: [] }]])
    },
    identity: { getHandles: async () => new Map([[1, 'femi']]) }
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
      createdAt: '2026-01-01T00:00:00.000Z'
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
