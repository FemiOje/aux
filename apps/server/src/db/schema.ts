import {
  bigint,
  boolean,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid
} from 'drizzle-orm/pg-core'

const id = () => bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity()
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()

// Identity module

export const users = pgTable('users', {
  id: id(),
  handle: text('handle').notNull().unique(),
  email: text('email').notNull().unique(),
  walletAddress: text('wallet_address'),
  preferredProvider: text('preferred_provider').notNull().default('youtube'),
  createdAt: createdAt()
})

export const follows = pgTable(
  'follows',
  {
    followerId: bigint('follower_id', { mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    followeeId: bigint('followee_id', { mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt()
  },
  (t) => [primaryKey({ columns: [t.followerId, t.followeeId] })]
)

// Catalog module

export const artists = pgTable('artists', {
  id: id(),
  mbid: uuid('mbid').unique(),
  name: text('name').notNull(),
  createdAt: createdAt()
})

export const recordings = pgTable('recordings', {
  id: id(),
  isrc: text('isrc'),
  title: text('title').notNull(),
  artistId: bigint('artist_id', { mode: 'number' })
    .notNull()
    .references(() => artists.id),
  durationMs: integer('duration_ms'),
  createdAt: createdAt()
})

export const providerTracks = pgTable(
  'provider_tracks',
  {
    id: id(),
    recordingId: bigint('recording_id', { mode: 'number' })
      .notNull()
      .references(() => recordings.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    providerTrackId: text('provider_track_id').notNull(),
    durationMs: integer('duration_ms'),
    available: boolean('available').notNull().default(true),
    createdAt: createdAt()
  },
  (t) => [unique().on(t.provider, t.providerTrackId)]
)

// Drops module

export const drops = pgTable('drops', {
  id: id(),
  userId: bigint('user_id', { mode: 'number' })
    .notNull()
    .references(() => users.id),
  recordingId: bigint('recording_id', { mode: 'number' })
    .notNull()
    .references(() => recordings.id),
  note: text('note').notNull(),
  chainDropId: bigint('chain_drop_id', { mode: 'number' }).unique(),
  createdAt: createdAt()
})

export const saves = pgTable(
  'saves',
  {
    id: id(),
    dropId: bigint('drop_id', { mode: 'number' })
      .notNull()
      .references(() => drops.id, { onDelete: 'cascade' }),
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt()
  },
  (t) => [unique().on(t.dropId, t.userId)]
)

// Written only by the indexer. from_user_id is null when the tipping wallet has no Aux account.
export const tips = pgTable(
  'tips',
  {
    id: id(),
    dropId: bigint('drop_id', { mode: 'number' })
      .notNull()
      .references(() => drops.id),
    fromUserId: bigint('from_user_id', { mode: 'number' }).references(() => users.id),
    fromAddress: text('from_address').notNull(),
    amountMon: numeric('amount_mon').notNull(),
    txHash: text('tx_hash').notNull(),
    logIndex: integer('log_index').notNull(),
    createdAt: createdAt()
  },
  (t) => [unique().on(t.txHash, t.logIndex)]
)
