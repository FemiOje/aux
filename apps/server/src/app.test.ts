// Runs against the local Postgres with the seed loaded (pnpm db:seed).
import { afterAll, describe, expect, it } from 'vitest'
import { dropSchema, feedResponseSchema } from '@aux/shared'
import { buildApp } from './app.js'
import { pool } from './db/index.js'

const app = buildApp({ logger: false })

afterAll(async () => {
  await app.close()
  await pool.end()
})

describe('GET /feed', () => {
  it('returns the seeded drops newest first, across pages, without repeats', async () => {
    const ids: number[] = []
    let url = '/feed?limit=2'

    for (;;) {
      const res = await app.inject({ method: 'GET', url })
      expect(res.statusCode).toBe(200)
      const page = feedResponseSchema.parse(res.json())
      ids.push(...page.drops.map((d) => d.id))
      if (!page.nextCursor) break
      url = `/feed?limit=2&cursor=${page.nextCursor}`
    }

    expect(ids.length).toBeGreaterThanOrEqual(3)
    expect(ids).toEqual([...new Set(ids)].sort((a, b) => b - a))
  })

  it.each(['/feed?limit=0', '/feed?limit=51', '/feed?limit=abc'])('rejects %s', async (url) => {
    const res = await app.inject({ method: 'GET', url })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('INVALID_QUERY')
  })

  it('rejects a bad cursor', async () => {
    const res = await app.inject({ method: 'GET', url: '/feed?cursor=nope' })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('INVALID_CURSOR')
  })
})

describe('GET /drops/:id', () => {
  it("returns femi's seeded drop with its recording, tracks and save count", async () => {
    const res = await app.inject({ method: 'GET', url: '/drops/1' })
    expect(res.statusCode).toBe(200)
    const drop = dropSchema.parse(res.json())
    expect(drop.curator.handle).toBe('femi')
    expect(drop.recording).toMatchObject({ title: 'Konko Below', artist: 'Lagbaja' })
    expect(drop.recording.tracks.map((t) => t.provider)).toEqual(['youtube'])
    expect(drop.saveCount).toBe(2)
  })

  it.each(['/drops/999999', '/drops/abc'])('404s for %s', async (url) => {
    const res = await app.inject({ method: 'GET', url })
    expect(res.statusCode).toBe(404)
    expect(res.json()).toEqual({ error: { code: 'DROP_NOT_FOUND', message: expect.any(String) } })
  })
})

it('uses the error shape for unknown routes', async () => {
  const res = await app.inject({ method: 'GET', url: '/nope' })
  expect(res.statusCode).toBe(404)
  expect(res.json().error.code).toBe('NOT_FOUND')
})
