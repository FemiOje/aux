import type { ProviderTrack, Recording } from '@aux/shared'
import type { CatalogRepository } from './repository.js'

export function createCatalogService(repository: CatalogRepository) {
  return {
    // Recordings with the tracks that can play them, keyed by recording id.
    async getRecordings(recordingIds: number[]): Promise<Map<number, Recording>> {
      const ids = [...new Set(recordingIds)]
      const [rows, tracks] = await Promise.all([
        repository.findRecordingsByIds(ids),
        repository.findAvailableTracks(ids)
      ])

      const tracksByRecording = new Map<number, ProviderTrack[]>()
      for (const { recordingId, provider, providerTrackId } of tracks) {
        const list = tracksByRecording.get(recordingId) ?? []
        list.push({ provider, providerTrackId })
        tracksByRecording.set(recordingId, list)
      }

      return new Map(rows.map((r) => [r.id, { ...r, tracks: tracksByRecording.get(r.id) ?? [] }]))
    }
  }
}

export type CatalogService = ReturnType<typeof createCatalogService>
