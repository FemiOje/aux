import { and, eq, gt, getTableColumns, inArray } from 'drizzle-orm'
import type { db as Db } from '../../db/index.js'
import { sessions, users } from '../../db/schema.js'

export type UserRow = typeof users.$inferSelect
type NewUser = Pick<UserRow, 'handle' | 'email' | 'walletAddress' | 'privyUserId'>

export function createIdentityRepository(db: typeof Db) {
  return {
    async findHandlesByIds(ids: number[]) {
      if (ids.length === 0) return []
      return db.select({ id: users.id, handle: users.handle }).from(users).where(inArray(users.id, ids))
    },

    async findUserByPrivyId(privyUserId: string): Promise<UserRow | undefined> {
      const [row] = await db.select().from(users).where(eq(users.privyUserId, privyUserId))
      return row
    },

    async findUserByEmail(email: string): Promise<UserRow | undefined> {
      const [row] = await db.select().from(users).where(eq(users.email, email))
      return row
    },

    // undefined when the handle, email or Privy ID is already taken.
    async insertUser(user: NewUser): Promise<UserRow | undefined> {
      const [row] = await db.insert(users).values(user).onConflictDoNothing().returning()
      return row
    },

    async updateUser(id: number, patch: Partial<Pick<UserRow, 'privyUserId' | 'walletAddress'>>) {
      const [row] = await db.update(users).set(patch).where(eq(users.id, id)).returning()
      return row
    },

    async insertSession(session: { userId: number; tokenHash: string; expiresAt: Date }) {
      await db.insert(sessions).values(session)
    },

    async findUserBySessionHash(tokenHash: string, now: Date): Promise<UserRow | undefined> {
      const [row] = await db
        .select(getTableColumns(users))
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now)))
      return row
    },

    async deleteSessionByHash(tokenHash: string): Promise<void> {
      await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash))
    }
  }
}

export type IdentityRepository = ReturnType<typeof createIdentityRepository>
