import { createHash, randomBytes, randomInt } from 'node:crypto'
import { HANDLE_MAX, type Me, type Profile, type SessionResponse, type UpdateMe } from '@aux/shared'
import { AppError } from '../../errors.js'
import type { AuthIdentity, AuthPort } from '../../ports/auth.js'
import type { IdentityRepository, UserPatch, UserRow } from './repository.js'

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
const HANDLE_ATTEMPTS = 5

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

// "Femi.Ade+music@example.com" -> "femiademusic"
export function handleFromEmail(email: string): string {
  const local = email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '')
  return local.slice(0, HANDLE_MAX) || 'user'
}

const toMe = (user: UserRow): Me => ({
  id: user.id,
  handle: user.handle,
  email: user.email,
  walletAddress: user.walletAddress,
  preferredProvider: user.preferredProvider,
  createdAt: user.createdAt.toISOString()
})

export function createIdentityService(repository: IdentityRepository, auth: AuthPort) {
  // Only ever changes the wallet or the Privy ID, so there is always a row back.
  async function linkUser(id: number, patch: Pick<UserPatch, 'privyUserId' | 'walletAddress'>): Promise<UserRow> {
    const updated = await repository.updateUser(id, patch)
    if (!updated) throw new Error(`user ${id} is gone`)
    return updated
  }

  async function findByHandle(handle: string): Promise<UserRow> {
    const user = await repository.findUserByHandle(handle)
    if (!user) throw new AppError(404, 'USER_NOT_FOUND', `No user with the handle ${handle}`)
    return user
  }

  async function createUser(identity: AuthIdentity, email: string): Promise<UserRow> {
    const base = handleFromEmail(email)
    for (let attempt = 0; attempt < HANDLE_ATTEMPTS; attempt++) {
      const handle = attempt === 0 ? base : `${base}${randomInt(1000, 10000)}`
      const created = await repository.insertUser({
        handle,
        email,
        walletAddress: identity.walletAddress,
        privyUserId: identity.subject
      })
      if (created) return created
      // Either the handle is taken, or the same person signed in twice at once and the other request won.
      const raced = await repository.findUserByPrivyId(identity.subject)
      if (raced) return raced
    }
    throw new Error(`Could not create a user for ${identity.subject}`)
  }

  async function findOrCreateUser(identity: AuthIdentity): Promise<UserRow> {
    const wallet = identity.walletAddress

    const known = await repository.findUserByPrivyId(identity.subject)
    if (known) {
      // The wallet can be made after the first sign-in.
      return wallet && wallet !== known.walletAddress ? linkUser(known.id, { walletAddress: wallet }) : known
    }

    if (!identity.email) throw new AppError(422, 'EMAIL_REQUIRED', 'Add an email address to sign in')

    // Someone we already have under this email (Privy has verified it) signing in with Privy for the first time.
    const byEmail = await repository.findUserByEmail(identity.email)
    if (byEmail) {
      // Created by this same person's other request between our two lookups.
      if (byEmail.privyUserId === identity.subject) return byEmail
      if (byEmail.privyUserId) throw new AppError(409, 'EMAIL_TAKEN', 'That email belongs to another account')
      return linkUser(byEmail.id, {
        privyUserId: identity.subject,
        walletAddress: wallet ?? byEmail.walletAddress
      })
    }

    return createUser(identity, identity.email)
  }

  return {
    async getHandles(userIds: number[]): Promise<Map<number, string>> {
      const rows = await repository.findHandlesByIds([...new Set(userIds)])
      return new Map(rows.map((r) => [r.id, r.handle]))
    },

    async signIn(privyToken: string): Promise<SessionResponse> {
      let identity: AuthIdentity | null
      try {
        identity = await auth.verifyToken(privyToken)
      } catch (cause) {
        throw new AppError(503, 'AUTH_UNAVAILABLE', 'Sign-in is unavailable right now', { cause })
      }
      if (!identity) throw new AppError(401, 'INVALID_TOKEN', 'Sign-in token is invalid or expired')

      const user = await findOrCreateUser(identity)
      const token = randomBytes(32).toString('base64url')
      const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
      await repository.insertSession({ userId: user.id, tokenHash: hashToken(token), expiresAt })

      return { token, expiresAt: expiresAt.toISOString(), user: toMe(user) }
    },

    // The user a session token belongs to, or null if the token is unknown or expired.
    async authenticate(sessionToken: string): Promise<Me | null> {
      const user = await repository.findUserBySessionHash(hashToken(sessionToken), new Date())
      return user ? toMe(user) : null
    },

    // Changes the handle, the preferred music service, or both. Drops follow the user, so they show the new handle.
    // The old handle is free for anyone to take straight away.
    async updateMe(user: Pick<Me, 'id'>, patch: UpdateMe): Promise<Me> {
      const updated = await repository.updateUser(user.id, patch)
      if (!updated) throw new AppError(409, 'HANDLE_TAKEN', `The handle ${patch.handle} is taken`)
      return toMe(updated)
    },

    async getProfile(handle: string): Promise<Profile> {
      const user = await findByHandle(handle)
      return { handle: user.handle, createdAt: user.createdAt.toISOString() }
    },

    // For other modules that list things by user. 404s like getProfile when nobody has the handle.
    async getUserId(handle: string): Promise<number> {
      return (await findByHandle(handle)).id
    },

    // Ends this one session. The user's other devices stay signed in.
    async signOut(sessionToken: string): Promise<void> {
      await repository.deleteSessionByHash(hashToken(sessionToken))
    }
  }
}

export type IdentityService = ReturnType<typeof createIdentityService>
