// Runs against the local Postgres with the seed loaded (pnpm db:seed). Removes the rows it adds.
import { afterAll, describe, expect, it } from 'vitest'
import { eq, like } from 'drizzle-orm'
import { resolveResponseSchema } from '@aux/shared'
import { buildApp } from '../../app.js'
import { db, pool } from '../../db/index.js'
import { artists, providerTracks, recordings } from '../../db/schema.js'
import type { ResolvePort, ResolvedTrack } from '../../ports/resolve.js'

const ARTIST = `Test Artist ${Date.now()}`
const track = (id: string, title: string, artist: string | null): ResolvedTrack => ({
  provider: 'youtube',
  providerTrackId: `test_${id}`,
  title,
  artist,
  durationMs: null
})

// Stands in for YouTube: links look like https://fake.test/<key>.
const tracks: Record<string, ResolvedTrack> = {
  seeded: { ...track('', 'ignored', 'ignored'), providerTrackId: 'QXIxC6msiow' },
  new: track('new', 'Brand New Song', ARTIST),
  'new-again': track('new_again', 'brand new song', ARTIST.toUpperCase()),
  reckoner: track('reckoner', 'reckoner', 'radiohead'),
  unsure: track('unsure', 'Weird Fishes', null)
}
const fake: ResolvePort = {
  async resolveUrl(url) {
    const { hostname, pathname } = new URL(url)
    if (hostname !== 'fake.test') return { status: 'unsupported' }
    const key = pathname.slice(1)
    if (key === 'down') throw new Error('boom')
    return key in tracks ? { status: 'found', track: tracks[key] } : { status: 'not_found' }
  }
}

const app = buildApp({ logger: false, resolvers: [fake] })
const resolve = (link: unknown) => app.inject({ method: 'POST', url: '/catalog/resolve', payload: { link } })

afterAll(async () => {
  await db.delete(providerTracks).where(like(providerTracks.providerTrackId, 'test\\_%'))
  const [artist] = await db.select().from(artists).where(eq(artists.name, ARTIST))
  if (artist) {
    await db.delete(recordings).where(eq(recordings.artistId, artist.id))
    await db.delete(artists).where(eq(artists.id, artist.id))
  }
  await app.close()
  await pool.end()
})

describe('POST /catalog/resolve', () => {
  it('returns the recording a known track belongs to', async () => {
    const res = await resolve('https://fake.test/seeded')
    expect(res.statusCode).toBe(200)
    const { recording, matches } = resolveResponseSchema.parse(res.json())
    expect(recording).toMatchObject({ title: 'Konko Below', artist: 'Lagbaja' })
    expect(matches).toEqual([])
  })

  it('adds a new song once, however often its link is pasted', async () => {
    const first = resolveResponseSchema.parse((await resolve('https://fake.test/new')).json())
    const second = resolveResponseSchema.parse((await resolve('https://fake.test/new')).json())

    expect(first.recording).toMatchObject({
      title: 'Brand New Song',
      artist: ARTIST,
      tracks: [{ provider: 'youtube', providerTrackId: 'test_new' }]
    })
    expect(second.recording).toEqual(first.recording)
    expect(await db.select().from(artists).where(eq(artists.name, ARTIST))).toHaveLength(1)
  })

  it('attaches another link for the same song instead of duplicating it', async () => {
    const original = resolveResponseSchema.parse((await resolve('https://fake.test/new')).json())
    const other = resolveResponseSchema.parse((await resolve('https://fake.test/new-again')).json())

    expect(other.recording?.id).toBe(original.recording?.id)
    expect(other.recording?.tracks.map((t) => t.providerTrackId)).toEqual(['test_new', 'test_new_again'])
  })

  it('matches a seeded song by artist and title, ignoring case', async () => {
    const { recording } = resolveResponseSchema.parse((await resolve('https://fake.test/reckoner')).json())
    expect(recording).toMatchObject({ title: 'Reckoner', artist: 'Radiohead' })
    expect(recording?.tracks).toContainEqual({ provider: 'youtube', providerTrackId: 'test_reckoner' })
  })

  it('offers close matches and writes nothing when the artist is unknown', async () => {
    const res = await resolve('https://fake.test/unsure')
    expect(res.statusCode).toBe(200)
    const { recording, matches } = resolveResponseSchema.parse(res.json())
    expect(recording).toBeNull()
    expect(matches.map((m) => m.title)).toEqual(['Weird Fishes/Arpeggi'])
    expect(
      await db.select().from(providerTracks).where(eq(providerTracks.providerTrackId, 'test_unsure'))
    ).toEqual([])
  })

  it.each([
    ['https://open.spotify.com/track/abc', 422, 'UNSUPPORTED_LINK'],
    ['https://fake.test/missing', 404, 'TRACK_NOT_FOUND'],
    ['https://fake.test/down', 502, 'RESOLVER_UNAVAILABLE'],
    ['not a url', 400, 'INVALID_BODY'],
    [undefined, 400, 'INVALID_BODY']
  ])('answers %s with %i %s', async (link, status, code) => {
    const res = await resolve(link)
    expect(res.statusCode).toBe(status)
    expect(res.json().error.code).toBe(code)
  })
})
