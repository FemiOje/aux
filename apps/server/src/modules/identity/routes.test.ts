// Runs against the local Postgres with the seed loaded (pnpm db:seed). Removes the rows it adds.
import { afterAll, describe, expect, it } from 'vitest'
import { eq, like } from 'drizzle-orm'
import { meSchema, profileSchema, sessionResponseSchema } from '@aux/shared'
import { buildApp } from '../../app.js'
import { db, pool } from '../../db/index.js'
import { sessions, users } from '../../db/schema.js'
import type { AuthIdentity, AuthPort } from '../../ports/auth.js'

const RUN = Date.now()
const DOMAIN = `${RUN}.auxtest.dev`
// Short enough to fit in a handle someone picks, which is capped at 20 characters.
const TAG = RUN.toString(36)
const person = (name: string, extra: Partial<AuthIdentity> = {}): AuthIdentity => ({
  subject: `did:privy:test-${name}-${RUN}`,
  email: `${name}_${RUN}@${DOMAIN}`,
  walletAddress: null,
  ...extra
})

// Stands in for Privy: the token is the key of the person signing in.
const people: Record<string, AuthIdentity> = {
  nia: person('nia', { walletAddress: '0x00000000000000000000000000000000000000a1' }),
  // Same handle as a seeded user.
  femi: person('femi', { email: `femi@${DOMAIN}` }),
  returning: person('returning'),
  'no-wallet': person('late'),
  'got-wallet': person('late', { walletAddress: '0x00000000000000000000000000000000000000b2' }),
  passkey: person('passkey', { email: null }),
  impostor: person('impostor', { email: person('nia').email }),
  renamer: person('renamer'),
  rival: person('rival'),
  listener: person('listener'),
  public: person('public', { walletAddress: '0x00000000000000000000000000000000000000c3' })
}
const fake: AuthPort = {
  async verifyToken(token) {
    if (token === 'down') throw new Error('boom')
    return people[token] ?? null
  }
}

const app = buildApp({ logger: false, auth: fake })
const signIn = (token: unknown) => app.inject({ method: 'POST', url: '/auth/session', payload: { token } })
const me = (authorization?: string) =>
  app.inject({ method: 'GET', url: '/me', headers: authorization ? { authorization } : {} })

afterAll(async () => {
  await db.delete(users).where(like(users.email, `%${DOMAIN}`))
  await app.close()
  await pool.end()
})

describe('POST /auth/session', () => {
  it('creates the user on first sign-in and returns a session that works on /me', async () => {
    const res = await signIn('nia')
    expect(res.statusCode).toBe(200)
    const session = sessionResponseSchema.parse(res.json())
    expect(session.user).toMatchObject({
      handle: `nia_${RUN}`,
      email: people.nia.email,
      walletAddress: people.nia.walletAddress,
      preferredProvider: 'youtube'
    })
    expect(Date.parse(session.expiresAt)).toBeGreaterThan(Date.now())

    const profile = await me(`Bearer ${session.token}`)
    expect(profile.statusCode).toBe(200)
    expect(meSchema.parse(profile.json())).toEqual(session.user)
  })

  it('returns the same user with a new session on later sign-ins', async () => {
    const first = sessionResponseSchema.parse((await signIn('nia')).json())
    const second = sessionResponseSchema.parse((await signIn('nia')).json())

    expect(second.user).toEqual(first.user)
    expect(second.token).not.toBe(first.token)
    expect((await me(`Bearer ${first.token}`)).statusCode).toBe(200)
  })

  it('creates one user when the same person signs in twice at once', async () => {
    const [a, b] = await Promise.all([signIn('femi'), signIn('femi')])
    expect(a.json().user.id).toBe(b.json().user.id)
  })

  it('picks another handle when the obvious one is taken', async () => {
    const { user } = sessionResponseSchema.parse((await signIn('femi')).json())
    expect(user.handle).toMatch(/^femi\d{4}$/)
  })

  it('links a user we already have by email instead of duplicating them', async () => {
    const email = people.returning.email!
    const [existing] = await db.insert(users).values({ handle: `returning_${RUN}`, email }).returning()

    const { user } = sessionResponseSchema.parse((await signIn('returning')).json())
    expect(user.id).toBe(existing.id)
    expect(sessionResponseSchema.parse((await signIn('returning')).json()).user.id).toBe(existing.id)
  })

  it('picks up a wallet made after the first sign-in', async () => {
    const before = sessionResponseSchema.parse((await signIn('no-wallet')).json())
    const after = sessionResponseSchema.parse((await signIn('got-wallet')).json())

    expect(before.user.walletAddress).toBeNull()
    expect(after.user).toEqual({ ...before.user, walletAddress: people['got-wallet'].walletAddress })
  })

  it('stores only a hash of the session token', async () => {
    const { token, user } = sessionResponseSchema.parse((await signIn('nia')).json())
    const rows = await db.select().from(sessions).where(eq(sessions.userId, user.id))
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.map((r) => r.tokenHash)).not.toContain(token)
  })

  it.each([
    ['unknown', 401, 'INVALID_TOKEN'],
    ['down', 503, 'AUTH_UNAVAILABLE'],
    ['passkey', 422, 'EMAIL_REQUIRED'],
    ['impostor', 409, 'EMAIL_TAKEN'],
    ['', 400, 'INVALID_BODY'],
    [undefined, 400, 'INVALID_BODY']
  ])('answers token %s with %i %s', async (token, status, code) => {
    const res = await signIn(token)
    expect(res.statusCode).toBe(status)
    expect(res.json().error.code).toBe(code)
  })
})

describe('DELETE /auth/session', () => {
  const signOut = (authorization?: string) =>
    app.inject({ method: 'DELETE', url: '/auth/session', headers: authorization ? { authorization } : {} })

  it('ends that session and leaves the user\'s other sessions alone', async () => {
    const phone = sessionResponseSchema.parse((await signIn('nia')).json())
    const laptop = sessionResponseSchema.parse((await signIn('nia')).json())

    expect((await signOut(`Bearer ${phone.token}`)).statusCode).toBe(204)

    expect((await me(`Bearer ${phone.token}`)).statusCode).toBe(401)
    expect((await me(`Bearer ${laptop.token}`)).statusCode).toBe(200)
    const left = await db.select().from(sessions).where(eq(sessions.userId, phone.user.id))
    expect(left.length).toBeGreaterThan(0)
  })

  it('removes the row rather than only expiring it', async () => {
    const { token, user } = sessionResponseSchema.parse((await signIn('returning')).json())
    const before = (await db.select().from(sessions).where(eq(sessions.userId, user.id))).length
    await signOut(`Bearer ${token}`)
    expect(await db.select().from(sessions).where(eq(sessions.userId, user.id))).toHaveLength(before - 1)
  })

  it('is fine with a session that is already gone', async () => {
    const { token } = sessionResponseSchema.parse((await signIn('nia')).json())
    expect((await signOut(`Bearer ${token}`)).statusCode).toBe(204)
    expect((await signOut(`Bearer ${token}`)).statusCode).toBe(204)
  })

  it.each([undefined, 'Basic abc'])('rejects authorization %s', async (authorization) => {
    const res = await signOut(authorization)
    expect(res.statusCode).toBe(401)
    expect(res.json().error.code).toBe('UNAUTHENTICATED')
  })
})

describe('GET /me', () => {
  it.each([undefined, 'Bearer nope', 'Bearer ', 'Basic abc'])('rejects authorization %s', async (authorization) => {
    const res = await me(authorization)
    expect(res.statusCode).toBe(401)
    expect(res.json().error.code).toBe('UNAUTHENTICATED')
  })

  it('rejects a Privy token used as a session token', async () => {
    expect((await me('Bearer nia')).statusCode).toBe(401)
  })

  it('rejects an expired session', async () => {
    const { token, user } = sessionResponseSchema.parse((await signIn('nia')).json())
    await db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(sessions.userId, user.id))

    expect((await me(`Bearer ${token}`)).statusCode).toBe(401)
  })
})

describe('PATCH /me', () => {
  const patch = (token: string | undefined, payload?: unknown) =>
    app.inject({
      method: 'PATCH',
      url: '/me',
      payload: payload as object,
      headers: token ? { authorization: `Bearer ${token}` } : {}
    })
  const session = async (name: string) => sessionResponseSchema.parse((await signIn(name)).json())
  const profile = (handle: string) => app.inject({ method: 'GET', url: `/users/${handle}` })

  it('changes the handle, everywhere it is read', async () => {
    const { token, user } = await session('renamer')
    const handle = `renamed_${TAG}`

    const res = await patch(token, { handle })
    expect(res.statusCode).toBe(200)
    expect(meSchema.parse(res.json())).toEqual({ ...user, handle })

    expect(meSchema.parse((await me(`Bearer ${token}`)).json()).handle).toBe(handle)
    expect((await session('renamer')).user).toEqual({ ...user, handle })
    expect((await profile(handle)).statusCode).toBe(200)
    expect((await profile(user.handle)).statusCode).toBe(404)
  })

  it('lowers capitals and trims spaces', async () => {
    const { token } = await session('renamer')
    const res = await patch(token, { handle: `  ReNamed2_${TAG} ` })
    expect(meSchema.parse(res.json()).handle).toBe(`renamed2_${TAG}`)
  })

  it('refuses a handle someone else has, and keeps the old one', async () => {
    const { token, user } = await session('rival')
    // One from the seed, one in capitals, and one another user picked for themselves.
    const taken = meSchema.parse((await me(`Bearer ${(await session('renamer')).token}`)).json()).handle

    for (const handle of ['femi', 'FEMI', taken]) {
      const res = await patch(token, { handle })
      expect(res.statusCode).toBe(409)
      expect(res.json().error.code).toBe('HANDLE_TAKEN')
    }
    expect(meSchema.parse((await me(`Bearer ${token}`)).json())).toEqual(user)
  })

  it('changes nothing else when the handle is taken', async () => {
    const { token, user } = await session('rival')
    const res = await patch(token, { handle: 'femi', preferredProvider: 'spotify' })
    expect(res.statusCode).toBe(409)
    expect(meSchema.parse((await me(`Bearer ${token}`)).json())).toEqual(user)
  })

  it('accepts the handle you already have', async () => {
    const { token, user } = await session('rival')
    const res = await patch(token, { handle: user.handle })
    expect(res.statusCode).toBe(200)
    expect(meSchema.parse(res.json())).toEqual(user)
  })

  it('frees the old handle for someone else', async () => {
    const mover = await session('listener')
    const taker = await session('rival')
    const [first, second] = [`first_${TAG}`, `second_${TAG}`]
    await patch(mover.token, { handle: first })
    expect((await patch(taker.token, { handle: first })).statusCode).toBe(409)
    expect((await patch(mover.token, { handle: second })).statusCode).toBe(200)

    const res = await patch(taker.token, { handle: first })
    expect(res.statusCode).toBe(200)
    expect(meSchema.parse(res.json())).toMatchObject({ id: taker.user.id, handle: first })
  })

  it('gives a handle to only one of two people asking at once', async () => {
    const [a, b] = [await session('renamer'), await session('rival')]
    const handle = `wanted_${TAG}`
    const results = await Promise.all([patch(a.token, { handle }), patch(b.token, { handle })])
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409])
  })

  it('changes the preferred music service, alone or with the handle', async () => {
    const { token, user } = await session('public')
    const alone = meSchema.parse((await patch(token, { preferredProvider: 'spotify' })).json())
    expect(alone).toEqual({ ...user, preferredProvider: 'spotify' })

    const handle = `both_${TAG}`
    const both = meSchema.parse((await patch(token, { handle, preferredProvider: 'youtube' })).json())
    expect(both).toEqual({ ...user, handle, preferredProvider: 'youtube' })
  })

  it.each([
    [undefined],
    [{}],
    [{ handle: 'ab' }],
    [{ handle: 'x'.repeat(21) }],
    [{ handle: 'two words' }],
    [{ handle: 'émile' }],
    [{ handle: 'dash-ed' }],
    [{ handle: '@femi' }],
    [{ handle: 42 }],
    [{ handle: null }],
    [{ preferredProvider: 'tidal' }],
    [{ email: 'new@example.com' }],
    [{ handle: `fine_${TAG}`, walletAddress: '0x00000000000000000000000000000000000000d4' }],
    [{ handle: `fine_${TAG}`, id: 1 }]
  ])('answers %j with 400 INVALID_BODY and changes nothing', async (payload) => {
    const { token, user } = await session('rival')
    const res = await patch(token, payload)
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('INVALID_BODY')
    expect(meSchema.parse((await me(`Bearer ${token}`)).json())).toEqual(user)
  })

  it.each([undefined, 'nope'])('needs a session (token %j)', async (token) => {
    const res = await patch(token, { handle: `anyone_${TAG}` })
    expect(res.statusCode).toBe(401)
    expect(res.json().error.code).toBe('UNAUTHENTICATED')
    expect((await profile(`anyone_${TAG}`)).statusCode).toBe(404)
  })
})

describe('GET /users/:handle', () => {
  const profile = (handle: string, authorization?: string) =>
    app.inject({ method: 'GET', url: `/users/${handle}`, headers: authorization ? { authorization } : {} })

  it('shows the handle and when they joined, and nothing private', async () => {
    const { user } = sessionResponseSchema.parse((await signIn('nia')).json())
    const res = await profile(user.handle)
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ handle: user.handle, createdAt: user.createdAt })
    expect(profileSchema.parse(res.json())).toEqual(res.json())
  })

  it('finds the handle whatever its capitals', async () => {
    expect(profileSchema.parse((await profile('FeMi')).json()).handle).toBe('femi')
  })

  it('needs no session, and ignores a bad one', async () => {
    expect((await profile('femi')).statusCode).toBe(200)
    expect((await profile('femi', 'Bearer nope')).statusCode).toBe(200)
  })

  it.each([`nobody_${TAG}`, 'x'.repeat(65), '%20'])('answers %s with 404 USER_NOT_FOUND', async (handle) => {
    const res = await profile(handle)
    expect(res.statusCode).toBe(404)
    expect(res.json().error.code).toBe('USER_NOT_FOUND')
  })
})
