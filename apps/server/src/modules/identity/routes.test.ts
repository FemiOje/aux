// Runs against the local Postgres with the seed loaded (pnpm db:seed). Removes the rows it adds.
import { afterAll, describe, expect, it } from 'vitest'
import { eq, like } from 'drizzle-orm'
import { meSchema, sessionResponseSchema } from '@aux/shared'
import { buildApp } from '../../app.js'
import { db, pool } from '../../db/index.js'
import { sessions, users } from '../../db/schema.js'
import type { AuthIdentity, AuthPort } from '../../ports/auth.js'

const RUN = Date.now()
const DOMAIN = `${RUN}.auxtest.dev`
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
  impostor: person('impostor', { email: person('nia').email })
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
