// Runs against the local Postgres with the seed loaded (pnpm db:seed). Removes the rows it adds.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq, inArray, like } from 'drizzle-orm'
import { dropSchema, feedResponseSchema, sessionResponseSchema, type Me } from '@aux/shared'
import { buildApp } from '../../app.js'
import { db, pool } from '../../db/index.js'
import { artists, drops, providerTracks, recordings, users } from '../../db/schema.js'
import type { AuthPort } from '../../ports/auth.js'
import type { ResolvePort, ResolvedTrack } from '../../ports/resolve.js'

const RUN = Date.now()
const DOMAIN = `${RUN}.auxdrops.dev`
const ARTIST = `Drop Test Artist ${RUN}`

// Stands in for Privy: any token signs in the one test curator.
const auth: AuthPort = {
  async verifyToken() {
    return { subject: `did:privy:drops-${RUN}`, email: `curator_${RUN}@${DOMAIN}`, walletAddress: null }
  }
}

// Stands in for YouTube: links look like https://fake.test/<key>.
const tracks: Record<string, ResolvedTrack> = {
  seeded: { provider: 'youtube', providerTrackId: 'QXIxC6msiow', title: 'ignored', artist: 'ignored', durationMs: null },
  new: { provider: 'youtube', providerTrackId: `droptest_${RUN}`, title: 'Dropped Song', artist: ARTIST, durationMs: null },
  unsure: { provider: 'youtube', providerTrackId: `droptest_unsure_${RUN}`, title: 'Weird Fishes', artist: null, durationMs: null }
}
const resolver: ResolvePort = {
  async resolveUrl(url) {
    const { hostname, pathname } = new URL(url)
    if (hostname !== 'fake.test') return { status: 'unsupported' }
    const key = pathname.slice(1)
    if (key === 'down') throw new Error('boom')
    return key in tracks ? { status: 'found', track: tracks[key] } : { status: 'not_found' }
  }
}

const app = buildApp({ logger: false, auth, resolvers: [resolver] })
let token: string
let curator: Me

const post = (payload: unknown, authorization: string | undefined = `Bearer ${token}`) =>
  app.inject({ method: 'POST', url: '/drops', payload: payload as object, headers: authorization ? { authorization } : {} })
const countDrops = async () => (await db.select().from(drops).where(eq(drops.userId, curator.id))).length

beforeAll(async () => {
  const res = await app.inject({ method: 'POST', url: '/auth/session', payload: { token: 'any' } })
  ;({ token, user: curator } = sessionResponseSchema.parse(res.json()))
})

afterAll(async () => {
  await db.delete(drops).where(eq(drops.userId, curator.id))
  await db.delete(providerTracks).where(like(providerTracks.providerTrackId, 'droptest\\_%'))
  const made = await db.select().from(artists).where(eq(artists.name, ARTIST))
  if (made.length > 0) {
    const ids = made.map((a) => a.id)
    await db.delete(recordings).where(inArray(recordings.artistId, ids))
    await db.delete(artists).where(inArray(artists.id, ids))
  }
  await db.delete(users).where(like(users.email, `%${DOMAIN}`))
  await app.close()
  await pool.end()
})

describe('POST /drops', () => {
  it('creates a drop from a link and shows it on the feed', async () => {
    const res = await post({ link: 'https://fake.test/seeded', note: 'Wait for the sax at 2:10.' })
    expect(res.statusCode).toBe(201)
    const drop = dropSchema.parse(res.json())
    expect(drop).toMatchObject({
      curator: { handle: curator.handle },
      recording: { title: 'Konko Below', artist: 'Lagbaja' },
      note: 'Wait for the sax at 2:10.',
      saveCount: 0
    })

    const fetched = await app.inject({ method: 'GET', url: `/drops/${drop.id}` })
    expect(dropSchema.parse(fetched.json())).toEqual(drop)
    const feed = feedResponseSchema.parse((await app.inject({ method: 'GET', url: '/feed?limit=50' })).json())
    expect(feed.drops.map((d) => d.id)).toContain(drop.id)
  })

  it('adds a song the catalog has not seen before', async () => {
    const res = await post({ link: 'https://fake.test/new', note: 'New to us' })
    expect(res.statusCode).toBe(201)
    expect(dropSchema.parse(res.json()).recording).toMatchObject({
      title: 'Dropped Song',
      artist: ARTIST,
      tracks: [{ provider: 'youtube', providerTrackId: tracks.new.providerTrackId }]
    })
  })

  it('lets the same song be dropped again', async () => {
    const first = dropSchema.parse((await post({ link: 'https://fake.test/seeded', note: 'once' })).json())
    const second = dropSchema.parse((await post({ link: 'https://fake.test/seeded', note: 'twice' })).json())
    expect(second.recording).toEqual(first.recording)
    expect(second.id).not.toBe(first.id)
  })

  it('trims the note', async () => {
    const res = await post({ link: 'https://fake.test/seeded', note: '  spaced out \n' })
    expect(dropSchema.parse(res.json()).note).toBe('spaced out')
  })

  it('refuses a link that could be several songs', async () => {
    const before = await countDrops()
    const res = await post({ link: 'https://fake.test/unsure', note: 'which one?' })
    expect(res.statusCode).toBe(422)
    expect(res.json().error.code).toBe('RECORDING_UNCLEAR')
    expect(await countDrops()).toBe(before)
  })

  it.each([
    [{ link: 'https://open.spotify.com/track/abc', note: 'n' }, 422, 'UNSUPPORTED_LINK'],
    [{ link: 'https://fake.test/missing', note: 'n' }, 404, 'TRACK_NOT_FOUND'],
    [{ link: 'https://fake.test/down', note: 'n' }, 502, 'RESOLVER_UNAVAILABLE'],
    [{ recordingId: 1, note: 'n' }, 400, 'INVALID_BODY'],
    [{ link: 'not a url', note: 'n' }, 400, 'INVALID_BODY'],
    [{ link: 'https://fake.test/seeded' }, 400, 'INVALID_BODY'],
    [{ link: 'https://fake.test/seeded', note: '   ' }, 400, 'INVALID_BODY'],
    [{ link: 'https://fake.test/seeded', note: 'x'.repeat(281) }, 400, 'INVALID_BODY'],
    [{ note: 'no song' }, 400, 'INVALID_BODY'],
    [undefined, 400, 'INVALID_BODY']
  ])('answers %j with %i %s', async (payload, status, code) => {
    const before = await countDrops()
    const res = await post(payload)
    expect(res.statusCode).toBe(status)
    expect(res.json().error.code).toBe(code)
    expect(await countDrops()).toBe(before)
  })

  it.each(['', 'Bearer nope'])('turns away authorization %j before looking at the body', async (authorization) => {
    const res = await post({ nonsense: true }, authorization)
    expect(res.statusCode).toBe(401)
    expect(res.json().error.code).toBe('UNAUTHENTICATED')
  })
})
