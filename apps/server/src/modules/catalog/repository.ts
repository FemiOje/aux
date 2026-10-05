import { and, asc, eq, ilike, inArray, sql } from 'drizzle-orm'
import type { db as Db } from '../../db/index.js'
import { artists, providerTracks, recordings } from '../../db/schema.js'

type NewTrack = { provider: string; providerTrackId: string; durationMs: number | null }
type NewRecording = { artist: string; title: string; durationMs: number | null; track: NewTrack }

// Thrown inside the transaction to undo it when someone else added the same track first.
class TrackTaken extends Error {}

export function createCatalogRepository(db: typeof Db) {
  return {
    async findRecordingsByIds(ids: number[]) {
      if (ids.length === 0) return []
      return db
        .select({
          id: recordings.id,
          title: recordings.title,
          artist: artists.name,
          durationMs: recordings.durationMs
        })
        .from(recordings)
        .innerJoin(artists, eq(artists.id, recordings.artistId))
        .where(inArray(recordings.id, ids))
    },

    async findAvailableTracks(recordingIds: number[]) {
      if (recordingIds.length === 0) return []
      return db
        .select({
          recordingId: providerTracks.recordingId,
          provider: providerTracks.provider,
          providerTrackId: providerTracks.providerTrackId
        })
        .from(providerTracks)
        .where(and(inArray(providerTracks.recordingId, recordingIds), eq(providerTracks.available, true)))
        .orderBy(asc(providerTracks.id))
    },

    async findRecordingIdByTrack(provider: string, providerTrackId: string) {
      const rows = await db
        .select({ recordingId: providerTracks.recordingId })
        .from(providerTracks)
        .where(and(eq(providerTracks.provider, provider), eq(providerTracks.providerTrackId, providerTrackId)))
      return rows.at(0)?.recordingId
    },

    // Same song if artist and title match, ignoring case.
    async findRecordingIdByArtistAndTitle(artist: string, title: string) {
      const rows = await db
        .select({ id: recordings.id })
        .from(recordings)
        .innerJoin(artists, eq(artists.id, recordings.artistId))
        .where(and(sql`lower(${artists.name}) = lower(${artist})`, sql`lower(${recordings.title}) = lower(${title})`))
        .orderBy(asc(recordings.id))
        .limit(1)
      return rows.at(0)?.id
    },

    async searchRecordingIdsByTitle(title: string, limit: number) {
      const pattern = `%${title.replace(/[\\%_]/g, '\\$&')}%`
      const rows = await db
        .select({ id: recordings.id })
        .from(recordings)
        .where(ilike(recordings.title, pattern))
        .orderBy(asc(recordings.id))
        .limit(limit)
      return rows.map((r) => r.id)
    },

    // Returns false when the track already belongs to a recording.
    async insertTrack(recordingId: number, track: NewTrack) {
      const inserted = await db
        .insert(providerTracks)
        .values({ recordingId, ...track })
        .onConflictDoNothing()
        .returning({ id: providerTracks.id })
      return inserted.length > 0
    },

    // Adds the artist (if new), the recording and its first track together.
    // Returns undefined when the track already belongs to a recording; nothing is written then.
    async insertRecordingWithTrack({ artist, title, durationMs, track }: NewRecording) {
      try {
        return await db.transaction(async (tx) => {
          const [existing] = await tx
            .select({ id: artists.id })
            .from(artists)
            .where(sql`lower(${artists.name}) = lower(${artist})`)
            .orderBy(asc(artists.id))
            .limit(1)
          const artistId =
            existing?.id ?? (await tx.insert(artists).values({ name: artist }).returning({ id: artists.id }))[0].id

          const [recording] = await tx
            .insert(recordings)
            .values({ title, artistId, durationMs })
            .returning({ id: recordings.id })

          const inserted = await tx
            .insert(providerTracks)
            .values({ recordingId: recording.id, ...track })
            .onConflictDoNothing()
            .returning({ id: providerTracks.id })
          if (inserted.length === 0) throw new TrackTaken()

          return recording.id
        })
      } catch (err) {
        if (err instanceof TrackTaken) return undefined
        throw err
      }
    }
  }
}

export type CatalogRepository = ReturnType<typeof createCatalogRepository>
