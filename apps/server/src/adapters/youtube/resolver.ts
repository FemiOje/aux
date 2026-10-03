import type { ResolvePort, ResolveResult } from '../../ports/resolve.js'

const OEMBED_URL = 'https://www.youtube.com/oembed'
const TIMEOUT_MS = 5_000

const VIDEO_ID = /^[\w-]{11}$/
const HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'])
const PATH_PREFIXES = ['/shorts/', '/embed/', '/live/']

// "(Official Video)", "[HD]", "(2009 Remaster)", etc
const NOISE =
  /\s*[([][^)\]]*\b(official|video|audio|lyrics?|visuali[sz]er|hd|hq|4k|remaster(ed)?)\b[^)\]]*[)\]]/gi
const TOPIC_SUFFIX = ' - Topic'

export function parseVideoId(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }

  let id: string | null = null
  if (parsed.hostname === 'youtu.be') {
    id = parsed.pathname.slice(1)
  } else if (HOSTS.has(parsed.hostname)) {
    const prefix = PATH_PREFIXES.find((p) => parsed.pathname.startsWith(p))
    id = prefix ? parsed.pathname.slice(prefix.length).split('/')[0] : parsed.searchParams.get('v')
  }
  return id && VIDEO_ID.test(id) ? id : null
}

// YouTube has no artist field, so read it from the two conventions music uploads follow.
export function parseMetadata(videoTitle: string, channel: string): { title: string; artist: string | null } {
  const title = videoTitle.replace(NOISE, '').trim() || videoTitle.trim()

  // Auto-generated "<Artist> - Topic" channels carry the bare song title.
  if (channel.endsWith(TOPIC_SUFFIX)) {
    return { title, artist: channel.slice(0, -TOPIC_SUFFIX.length) }
  }

  const split = title.match(/^(.+?)\s[-–—]\s(.+)$/)
  if (split) return { title: split[2].trim(), artist: split[1].trim() }

  return { title, artist: null }
}

// Uses YouTube's oEmbed endpoint: no API key, and it only answers for videos that can be embedded.
export class YouTubeResolver implements ResolvePort {
  constructor(private readonly fetchFn: typeof fetch = fetch) {}

  async resolveUrl(url: string): Promise<ResolveResult> {
    const videoId = parseVideoId(url)
    if (!videoId) return { status: 'unsupported' }

    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`
    const res = await this.fetchFn(`${OEMBED_URL}?format=json&url=${encodeURIComponent(watchUrl)}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })

    // 400/404: no such video. 401/403: private or embedding disabled, so we couldn't play it anyway.
    if ([400, 401, 403, 404].includes(res.status)) return { status: 'not_found' }
    if (!res.ok) throw new Error(`YouTube oEmbed answered ${res.status}`)

    const body = (await res.json()) as { title?: unknown; author_name?: unknown }
    if (typeof body.title !== 'string' || typeof body.author_name !== 'string') {
      throw new Error('YouTube oEmbed answered without a title or author')
    }

    return {
      status: 'found',
      track: {
        provider: 'youtube',
        providerTrackId: videoId,
        ...parseMetadata(body.title, body.author_name),
        // oEmbed doesn't report length.
        durationMs: null
      }
    }
  }
}
