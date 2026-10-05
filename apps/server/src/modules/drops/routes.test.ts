// Runs against the local Postgres with the seed loaded (pnpm db:seed). Removes the rows it adds.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq, inArray, like } from 'drizzle-orm'
import { dropSchema, feedResponseSchema, resolveResponseSchema, sessionResponseSchema, type Me } from '@aux/shared'
import { buildApp } from '../../app.js'
import { db, pool } from '../../db/index.js'
import { artists, drops, providerTracks, recordings, users } from '../../db/schema.js'
import type { AuthPort } from '../../ports/auth.js'
import type { ResolvePort, ResolvedTrack } from '../../ports/resolve.js'

const RUN = Date.now()
const DOMAIN = `${RUN}.auxdrops.dev`
const ARTIST = `Drop Test Artist ${RUN}`

// Stands in for Privy: the token is the name of the test user it signs in.
const auth: AuthPort = {
  async verifyToken(name) {
    return { subject: `did:privy:drops-${name}-${RUN}`, email: `${name}_${RUN}@${DOMAIN}`, walletAddress: null }
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
// A second user, so a save can be seen from the saver's side and from someone else's.
let listenerToken: string

const post = (payload: unknown, authorization: string | undefined = `Bearer ${token}`) =>
  app.inject({ method: 'POST', url: '/drops', payload: payload as object, headers: authorization ? { authorization } : {} })
const countDrops = async () => (await db.select().from(drops).where(eq(drops.userId, curator.id))).length

beforeAll(async () => {
  const signIn = async (name: string) =>
    sessionResponseSchema.parse(
      (await app.inject({ method: 'POST', url: '/auth/session', payload: { token: name } })).json()
    )
  ;({ token, user: curator } = await signIn('curator'))
  ;({ token: listenerToken } = await signIn('listener'))
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
      saveCount: 0,
      saved: false
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

  it('creates a drop from a close match of an unclear link', async () => {
    const link = 'https://fake.test/unsure'
    const resolved = await app.inject({ method: 'POST', url: '/catalog/resolve', payload: { link } })
    const { recording, matches } = resolveResponseSchema.parse(resolved.json())
    expect(recording).toBeNull()
    const picked = matches.find((m) => m.artist === 'Radiohead')
    expect(picked).toBeDefined()

    const res = await post({ recordingId: picked!.id, note: 'This one.' })
    expect(res.statusCode).toBe(201)
    const drop = dropSchema.parse(res.json())
    expect(drop).toMatchObject({ curator: { handle: curator.handle }, recording: picked, note: 'This one.', saved: false })

    const fetched = await app.inject({ method: 'GET', url: `/drops/${drop.id}` })
    expect(dropSchema.parse(fetched.json())).toEqual(drop)
    // Picking a song says nothing about the link, so the link stays unclear for the next person.
    expect((await post({ link, note: 'still unclear' })).statusCode).toBe(422)
  })

  it('trims the note of a picked song', async () => {
    const res = await post({ recordingId: 1, note: '  picked \n' })
    expect(dropSchema.parse(res.json()).note).toBe('picked')
  })

  it.each([
    [{ link: 'https://open.spotify.com/track/abc', note: 'n' }, 422, 'UNSUPPORTED_LINK'],
    [{ link: 'https://fake.test/missing', note: 'n' }, 404, 'TRACK_NOT_FOUND'],
    [{ link: 'https://fake.test/down', note: 'n' }, 502, 'RESOLVER_UNAVAILABLE'],
    [{ recordingId: 999999999, note: 'n' }, 404, 'RECORDING_NOT_FOUND'],
    [{ recordingId: 1, link: 'https://fake.test/seeded', note: 'n' }, 400, 'INVALID_BODY'],
    [{ recordingId: '1', note: 'n' }, 400, 'INVALID_BODY'],
    [{ recordingId: 0, note: 'n' }, 400, 'INVALID_BODY'],
    [{ recordingId: 1.5, note: 'n' }, 400, 'INVALID_BODY'],
    [{ recordingId: 1 }, 400, 'INVALID_BODY'],
    [{ recordingId: 1, note: '   ' }, 400, 'INVALID_BODY'],
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

describe('saving a drop', () => {
  let dropId: number

  const bearer = (sessionToken: string | undefined) => (sessionToken ? { authorization: `Bearer ${sessionToken}` } : {})
  const save = (method: 'POST' | 'DELETE', id: number | string, sessionToken: string | undefined = listenerToken) =>
    app.inject({ method, url: `/drops/${id}/save`, headers: bearer(sessionToken) })
  const getDrop = async (sessionToken?: string) =>
    dropSchema.parse((await app.inject({ method: 'GET', url: `/drops/${dropId}`, headers: bearer(sessionToken) })).json())

  beforeAll(async () => {
    dropId = dropSchema.parse((await post({ link: 'https://fake.test/seeded', note: 'save me' })).json()).id
  })

  it('saves once, however many times it is asked', async () => {
    const first = await save('POST', dropId)
    expect(first.statusCode).toBe(200)
    expect(dropSchema.parse(first.json())).toMatchObject({ id: dropId, saveCount: 1, saved: true })
    expect(dropSchema.parse((await save('POST', dropId)).json())).toMatchObject({ saveCount: 1, saved: true })
  })

  it('shows the save only to the person who made it', async () => {
    expect(await getDrop(listenerToken)).toMatchObject({ saveCount: 1, saved: true })
    expect(await getDrop(token)).toMatchObject({ saveCount: 1, saved: false })
    expect(await getDrop()).toMatchObject({ saveCount: 1, saved: false })

    const feed = await app.inject({ method: 'GET', url: '/feed?limit=50', headers: bearer(listenerToken) })
    expect(feedResponseSchema.parse(feed.json()).drops.find((d) => d.id === dropId)).toMatchObject({ saved: true })
  })

  it('unsaves, and unsaving again changes nothing', async () => {
    const first = await save('DELETE', dropId)
    expect(first.statusCode).toBe(200)
    expect(dropSchema.parse(first.json())).toMatchObject({ id: dropId, saveCount: 0, saved: false })
    expect(dropSchema.parse((await save('DELETE', dropId)).json())).toMatchObject({ saveCount: 0, saved: false })
  })

  it('lets you save your own drop', async () => {
    expect(dropSchema.parse((await save('POST', dropId, token)).json())).toMatchObject({ saveCount: 1, saved: true })
    expect(dropSchema.parse((await save('DELETE', dropId, token)).json())).toMatchObject({ saveCount: 0, saved: false })
  })

  it.each([
    ['POST', '999999999'],
    ['DELETE', '999999999'],
    ['POST', 'abc'],
    ['DELETE', 'abc']
  ] as const)('answers %s for drop %s with 404', async (method, id) => {
    const res = await save(method, id)
    expect(res.statusCode).toBe(404)
    expect(res.json().error.code).toBe('DROP_NOT_FOUND')
  })

  it.each(['POST', 'DELETE'] as const)('needs a session to %s', async (method) => {
    const res = await save(method, dropId, 'nope')
    expect(res.statusCode).toBe(401)
    expect(res.json().error.code).toBe('UNAUTHENTICATED')
  })
})

describe('reading drops with a session', () => {
  it.each(['/feed', '/drops/1'])('turns away a session that is no longer good on GET %s', async (url) => {
    const res = await app.inject({ method: 'GET', url, headers: { authorization: 'Bearer nope' } })
    expect(res.statusCode).toBe(401)
    expect(res.json().error.code).toBe('UNAUTHENTICATED')
  })
})
