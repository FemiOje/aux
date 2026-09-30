// Loads the sample data from the README. Dev only: wipes these tables first.
import { sql } from 'drizzle-orm'
import { db, pool } from './index.js'
import { artists, drops, follows, providerTracks, recordings, saves, tips, users } from './schema.js'

await db.execute(sql`
  TRUNCATE users, follows, artists, recordings, provider_tracks, drops, saves, tips
  RESTART IDENTITY CASCADE
`)

const [femi, ada, tunde] = await db
  .insert(users)
  .values([
    { handle: 'femi', email: 'femi@example.com', walletAddress: '0x1a2b000000000000000000000000000000009f01', preferredProvider: 'youtube' },
    { handle: 'ada', email: 'ada@example.com', walletAddress: '0x3c4d000000000000000000000000000000007e22', preferredProvider: 'spotify' },
    { handle: 'tunde', email: 'tunde@example.com', walletAddress: '0x5e6f000000000000000000000000000000005d33', preferredProvider: 'youtube' }
  ])
  .returning()

await db.insert(follows).values([
  { followerId: ada.id, followeeId: femi.id },
  { followerId: tunde.id, followeeId: femi.id },
  { followerId: femi.id, followeeId: ada.id }
])

const [radiohead, lagbaja] = await db
  .insert(artists)
  .values([
    { mbid: 'a74b1b7f-71a5-4011-9441-d0b5e4122711', name: 'Radiohead' },
    { mbid: '5c2e0c1a-8a90-4b3e-9f7d-2b1c6d4e8a90', name: 'Lagbaja' },
    { mbid: '91d03b47-1c2d-4e5f-8a9b-0c1d2e3f3b47', name: 'Yuno Miles' },
    { mbid: 'e3f8c215-4a5b-4c6d-9e7f-8a9b0c1dc215', name: 'cruelsantino' }
  ])
  .returning()

const [weirdFishes, reckoner, konkoBelow] = await db
  .insert(recordings)
  .values([
    { isrc: 'GBAYE0700123', title: 'Weird Fishes/Arpeggi', artistId: radiohead.id, durationMs: 318000 },
    { isrc: 'GBAYE0700456', title: 'Reckoner', artistId: radiohead.id, durationMs: 290000 },
    { isrc: 'NGABC0000045', title: 'Konko Below', artistId: lagbaja.id, durationMs: 412000 }
  ])
  .returning()

await db.insert(providerTracks).values([
  { recordingId: weirdFishes.id, provider: 'youtube', providerTrackId: 'yt_Ab12Cd', durationMs: 319000 },
  { recordingId: weirdFishes.id, provider: 'spotify', providerTrackId: 'sp_9xYzQ1', durationMs: 318000 },
  { recordingId: konkoBelow.id, provider: 'youtube', providerTrackId: 'yt_Kz88Lq', durationMs: 415000 }
])

const [femiDrop, adaDrop] = await db
  .insert(drops)
  .values([
    { userId: femi.id, recordingId: konkoBelow.id, note: 'Wait for the sax at 2:10.', chainDropId: 0 },
    { userId: ada.id, recordingId: weirdFishes.id, note: 'Put this on at night with headphones.', chainDropId: 1 },
    { userId: tunde.id, recordingId: reckoner.id, note: 'The drums in the second half.' }
  ])
  .returning()

await db.insert(saves).values([
  { dropId: femiDrop.id, userId: ada.id },
  { dropId: adaDrop.id, userId: femi.id },
  { dropId: femiDrop.id, userId: tunde.id }
])

await db.insert(tips).values([
  { dropId: femiDrop.id, fromUserId: ada.id, fromAddress: ada.walletAddress!, amountMon: '0.5', txHash: '0x9f3e00000000000000000000000000000000000000000000000000000000a1b2', logIndex: 3 },
  { dropId: femiDrop.id, fromUserId: tunde.id, fromAddress: tunde.walletAddress!, amountMon: '0.25', txHash: '0x7c1d00000000000000000000000000000000000000000000000000000000e4f5', logIndex: 1 }
])

console.log('seeded')
await pool.end()
