import type { ProviderTrack, Recording, ResolveResponse } from '@aux/shared'
import { AppError } from '../../errors.js'
import type { ResolvePort, ResolveResult } from '../../ports/resolve.js'
import type { CatalogRepository } from './repository.js'

const MAX_MATCHES = 5

export function createCatalogService(repository: CatalogRepository, resolvers: ResolvePort[]) {
  // Recordings with the tracks that can play them, keyed by recording id.
  async function getRecordings(recordingIds: number[]): Promise<Map<number, Recording>> {
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

  // The first adapter that recognises the link answers for it.
  async function askResolvers(url: string): Promise<ResolveResult> {
    for (const resolver of resolvers) {
      let result: ResolveResult
      try {
        result = await resolver.resolveUrl(url)
      } catch (cause) {
        throw new AppError(502, 'RESOLVER_UNAVAILABLE', "Couldn't reach the music service. Try again", { cause })
      }
      if (result.status !== 'unsupported') return result
    }
    return { status: 'unsupported' }
  }

  return {
    getRecordings,

    // Turns a pasted link into a recording in our catalog, adding it if it's new to us.
    async resolveLink(url: string): Promise<ResolveResponse> {
      const result = await askResolvers(url)
      if (result.status === 'unsupported') {
        throw new AppError(422, 'UNSUPPORTED_LINK', 'Only YouTube links work for now')
      }
      if (result.status === 'not_found') {
        throw new AppError(404, 'TRACK_NOT_FOUND', "That link doesn't point at a playable song")
      }

      const { provider, providerTrackId, title, artist, durationMs } = result.track
      const track = { provider, providerTrackId, durationMs }
      const found = async (id: number) => ({ recording: (await getRecordings([id])).get(id) ?? null, matches: [] })

      const known = await repository.findRecordingIdByTrack(provider, providerTrackId)
      if (known !== undefined) return found(known)

      // Without an artist we'd be guessing, so offer what we have and write nothing.
      if (artist === null) {
        const ids = await repository.searchRecordingIdsByTitle(title, MAX_MATCHES)
        const matches = await getRecordings(ids)
        return { recording: null, matches: ids.flatMap((id) => matches.get(id) ?? []) }
      }

      const sameSong = await repository.findRecordingIdByArtistAndTitle(artist, title)
      const added =
        sameSong !== undefined
          ? (await repository.insertTrack(sameSong, track)) && sameSong
          : await repository.insertRecordingWithTrack({ artist, title, durationMs, track })
      if (added) return found(added)

      // Someone resolved the same link at the same moment; use theirs.
      const theirs = await repository.findRecordingIdByTrack(provider, providerTrackId)
      if (theirs === undefined) throw new Error(`track ${provider}:${providerTrackId} vanished mid-resolve`)
      return found(theirs)
    }
  }
}

export type CatalogService = ReturnType<typeof createCatalogService>
