import { and, asc, eq, inArray } from 'drizzle-orm'
import type { db as Db } from '../../db/index.js'
import { artists, providerTracks, recordings } from '../../db/schema.js'

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
    }
  }
}

export type CatalogRepository = ReturnType<typeof createCatalogRepository>
