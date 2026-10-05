// What a link turned out to be on a music service.
export type ResolvedTrack = {
  provider: string
  providerTrackId: string
  title: string
  // null when the service can't tell us who the artist is (e.g. a fan upload).
  artist: string | null
  durationMs: number | null
}

export type ResolveResult =
  | { status: 'unsupported' } // not a link this adapter understands
  | { status: 'not_found' } // our kind of link, but nothing playable is there
  | { status: 'found'; track: ResolvedTrack }

// The checklist every link-resolving adapter fulfils. Core code never calls a music service directly.
export interface ResolvePort {
  resolveUrl(url: string): Promise<ResolveResult>
}
