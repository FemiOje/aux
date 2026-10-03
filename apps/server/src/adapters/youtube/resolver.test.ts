import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseMetadata, parseVideoId, YouTubeResolver } from './resolver.js'

const ID = 'QXIxC6msiow'

const fetching = (respond: () => Response | Promise<Response>) => vi.fn(respond) as unknown as typeof fetch
const answering = (status: number, body: unknown = {}) =>
  fetching(() => new Response(JSON.stringify(body), { status }))
const resolve = (fetchFn: typeof fetch, url = `https://youtu.be/${ID}`) => new YouTubeResolver(fetchFn).resolveUrl(url)

// Small seeded generator so the generated cases are the same on every run.
function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 2 ** 32
    return seed / 2 ** 32
  }
}
const pick = (random: () => number, alphabet: string, length: number) =>
  Array.from({ length }, () => alphabet[Math.floor(random() * alphabet.length)]).join('')

describe('parseVideoId', () => {
  it.each([
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?v=${ID}&t=42s`,
    `https://m.youtube.com/watch?feature=share&v=${ID}`,
    `https://music.youtube.com/watch?v=${ID}`,
    `https://www.youtube.com/watch?v=${ID}&list=PL123&index=2`,
    `https://www.youtube.com/watch?v=${ID}#t=30`,
    `http://www.youtube.com/watch?v=${ID}`,
    `HTTPS://WWW.YOUTUBE.COM/watch?v=${ID}`,
    `https://youtu.be/${ID}`,
    `https://youtu.be/${ID}?si=abc`,
    `https://youtu.be/${ID}/`,
    `https://youtu.be/${ID}/?si=abc`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/shorts/${ID}?feature=share`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube.com/embed/${ID}?start=30`,
    `https://www.youtube.com/embed/${ID}/`,
    `https://www.youtube.com/live/${ID}`,
    `https://www.youtube.com/live/${ID}?si=abc`
  ])('reads the id from %s', (url) => {
    expect(parseVideoId(url)).toBe(ID)
  })

  it.each(['-_-_-_-_-_-', '___________', '00000000000', 'aB3-dE6_gH9'])('accepts the id %s', (id) => {
    expect(parseVideoId(`https://youtu.be/${id}`)).toBe(id)
  })

  it.each([
    'https://open.spotify.com/track/abc',
    'https://www.youtube.com/@Radiohead',
    'https://www.youtube.com/',
    'https://www.youtube.com/watch',
    'https://www.youtube.com/watch?v=',
    'https://www.youtube.com/watch?v=short',
    `https://www.youtube.com/watch?v=${ID}x`,
    `https://www.youtube.com/watch?v=${ID.slice(0, 10)}!`,
    `https://www.youtube.com/watch?V=${ID}`,
    'https://www.youtube.com/playlist?list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf',
    'https://www.youtube.com/channel/UCq19-LqvG35A-30oyAiPiqA',
    'https://www.youtube.com/shorts/',
    'https://youtu.be/',
    `https://youtu.be/${ID}x`,
    `https://youtu.be//${ID}`,
    `https://notyoutube.com/watch?v=${ID}`,
    `https://youtube.com.evil.test/watch?v=${ID}`,
    `https://evil.test/?u=https://www.youtube.com/watch?v=${ID}`,
    `https://evil.test/watch?v=${ID}#youtube.com`,
    `www.youtube.com/watch?v=${ID}`,
    ID,
    'not a url',
    ''
  ])('ignores %s', (url) => {
    expect(parseVideoId(url)).toBeNull()
  })

  it('reads any well-formed id from every link shape', () => {
    const random = seeded(1)
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
    for (let i = 0; i < 500; i++) {
      const id = pick(random, alphabet, 11)
      for (const url of [
        `https://www.youtube.com/watch?v=${id}`,
        `https://music.youtube.com/watch?v=${id}&si=x`,
        `https://youtu.be/${id}`,
        `https://www.youtube.com/shorts/${id}`,
        `https://www.youtube.com/embed/${id}`,
        `https://www.youtube.com/live/${id}`
      ]) {
        expect(parseVideoId(url), url).toBe(id)
      }
    }
  })

  it('never throws, and only ever returns a well-formed id', () => {
    const random = seeded(2)
    const alphabet = 'abcXYZ019-_/:?&=#%.@ \\\'"<>[]{}💿'
    const prefixes = ['', 'https://', 'https://youtu.be/', 'https://www.youtube.com/', 'https://www.youtube.com/watch?v=']
    for (let i = 0; i < 2000; i++) {
      const url = prefixes[i % prefixes.length] + pick(random, alphabet, Math.floor(random() * 30))
      const id = parseVideoId(url)
      if (id !== null) expect(id, url).toMatch(/^[\w-]{11}$/)
    }
  })
})

describe('parseMetadata', () => {
  it.each([
    ['Lagbaja – Konko Below (Official Lyric Video)', 'Mandara Entertainment', 'Konko Below', 'Lagbaja'],
    ['Radiohead - Weird Fishes/Arpeggi (Scotch Mist)', 'Radiohead', 'Weird Fishes/Arpeggi (Scotch Mist)', 'Radiohead'],
    ['Radiohead - Reckoner [HD]', 'someone', 'Reckoner', 'Radiohead'],
    ['Reckoner', 'Radiohead - Topic', 'Reckoner', 'Radiohead'],
    ['Jay-Z - 99 Problems', 'JayZVEVO', '99 Problems', 'Jay-Z'],
    ['Sigur Rós — Hoppípolla', 'Sigur Rós', 'Hoppípolla', 'Sigur Rós'],
    ['  Radiohead  -  Reckoner  ', 'someone', 'Reckoner', 'Radiohead'],
    ['Daft Punk - Get Lucky (Official Audio) [HD]', 'Daft Punk', 'Get Lucky', 'Daft Punk'],
    ['Daft Punk - Get Lucky (OFFICIAL MUSIC VIDEO)', 'Daft Punk', 'Get Lucky', 'Daft Punk'],
    ['Daft Punk - Get Lucky (Official Video) ft. Pharrell', 'Daft Punk', 'Get Lucky ft. Pharrell', 'Daft Punk'],
    ['Daft Punk - Get Lucky (feat. Pharrell Williams)', 'x', 'Get Lucky (feat. Pharrell Williams)', 'Daft Punk'],
    ['The Beatles - Come Together (2019 Remaster)', 'x', 'Come Together', 'The Beatles'],
    ['The Beatles - Come Together (Remastered 2009)', 'x', 'Come Together', 'The Beatles'],
    ['Tame Impala - Let It Happen (Visualiser)', 'x', 'Let It Happen', 'Tame Impala'],
    ['Tame Impala - Let It Happen [Lyrics]', 'x', 'Let It Happen', 'Tame Impala'],
    ['Tame Impala - Let It Happen (4K)', 'x', 'Let It Happen', 'Tame Impala'],
    ['Radiohead - Reckoner (Live From The Basement)', 'x', 'Reckoner (Live From The Basement)', 'Radiohead'],
    ['Lana Del Rey - Video Games', 'x', 'Video Games', 'Lana Del Rey'],
    ['Artist - Song - Live in Lagos', 'x', 'Song - Live in Lagos', 'Artist'],
    ['Song - Live in Lagos', 'Artist - Topic', 'Song - Live in Lagos', 'Artist'],
    ['Reckoner (Official Audio)', 'Radiohead - Topic', 'Reckoner', 'Radiohead'],
    ['Reckoner', ' Radiohead - Topic', 'Reckoner', 'Radiohead'],
    ['Radiohead - Reckoner', ' - Topic', 'Reckoner', 'Radiohead']
  ])('%s by %s', (videoTitle, channel, title, artist) => {
    expect(parseMetadata(videoTitle, channel)).toEqual({ title, artist })
  })

  it.each([
    ['my favourite song ever', 'xX_fan_Xx', 'my favourite song ever'],
    ['Radiohead-Reckoner', 'someone', 'Radiohead-Reckoner'],
    ['Radiohead: Reckoner', 'someone', 'Radiohead: Reckoner'],
    ['Reckoner (Official Video)', 'Radiohead', 'Reckoner'],
    ['Reckoner', 'Radiohead - Topics', 'Reckoner'],
    ['Reckoner', ' - Topic', 'Reckoner'],
    ['Reckoner', '   - Topic', 'Reckoner'],
    ['- Reckoner', 'someone', '- Reckoner'],
    ['(Official Video)', 'someone', '(Official Video)']
  ])("leaves the artist empty when it can't tell: %s by %s", (videoTitle, channel, title) => {
    expect(parseMetadata(videoTitle, channel)).toEqual({ title, artist: null })
  })

  it('never returns an empty title or artist for a real title', () => {
    const random = seeded(3)
    const alphabet = 'abc XYZ-–—()[]official video hd'
    for (let i = 0; i < 2000; i++) {
      const videoTitle = `x${pick(random, alphabet, Math.floor(random() * 40))}`
      const { title, artist } = parseMetadata(videoTitle, ['someone', 'Someone - Topic', ' - Topic'][i % 3])
      expect(title, videoTitle).not.toBe('')
      expect(title, videoTitle).toBe(title.trim())
      if (artist !== null) expect(artist, videoTitle).not.toBe('')
    }
  })
})

describe('YouTubeResolver', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('resolves a link through oEmbed', async () => {
    const fetchFn = answering(200, { title: 'Reckoner', author_name: 'Radiohead - Topic' })
    const result = await resolve(fetchFn)

    expect(result).toEqual({
      status: 'found',
      track: { provider: 'youtube', providerTrackId: ID, title: 'Reckoner', artist: 'Radiohead', durationMs: null }
    })
    expect(vi.mocked(fetchFn).mock.calls[0][0]).toContain(encodeURIComponent(`watch?v=${ID}`))
  })

  it.each([
    `https://youtu.be/${ID}?si=abc`,
    `https://music.youtube.com/watch?v=${ID}&list=PL123`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/embed/${ID}?start=30`,
    `https://www.youtube.com/live/${ID}`
  ])('asks oEmbed about the plain watch link for %s', async (url) => {
    const fetchFn = answering(200, { title: 'Reckoner', author_name: 'Radiohead - Topic' })
    await resolve(fetchFn, url)

    expect(fetchFn).toHaveBeenCalledTimes(1)
    const asked = new URL(vi.mocked(fetchFn).mock.calls[0][0] as string)
    expect(asked.origin + asked.pathname).toBe('https://www.youtube.com/oembed')
    expect(Object.fromEntries(asked.searchParams)).toEqual({
      format: 'json',
      url: `https://www.youtube.com/watch?v=${ID}`
    })
  })

  it('gives the request a timeout', async () => {
    const fetchFn = answering(200, { title: 'Reckoner', author_name: 'Radiohead - Topic' })
    await resolve(fetchFn)
    expect(vi.mocked(fetchFn).mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal)
  })

  it('uses the global fetch by default', async () => {
    const fetchFn = answering(200, { title: 'Reckoner', author_name: 'Radiohead - Topic' })
    vi.stubGlobal('fetch', fetchFn)
    expect(await new YouTubeResolver().resolveUrl(`https://youtu.be/${ID}`)).toMatchObject({ status: 'found' })
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('cleans up the title and reads the artist out of it', async () => {
    const fetchFn = answering(200, { title: 'Lagbaja – Konko Below (Official Lyric Video)', author_name: 'Mandara' })
    expect(await resolve(fetchFn)).toMatchObject({ track: { title: 'Konko Below', artist: 'Lagbaja' } })
  })

  it("finds the track without an artist when it can't tell who it is", async () => {
    const fetchFn = answering(200, { title: 'my favourite song ever', author_name: 'xX_fan_Xx' })
    expect(await resolve(fetchFn)).toEqual({
      status: 'found',
      track: {
        provider: 'youtube',
        providerTrackId: ID,
        title: 'my favourite song ever',
        artist: null,
        durationMs: null
      }
    })
  })

  it('ignores the other fields oEmbed sends', async () => {
    const fetchFn = answering(200, {
      title: 'Reckoner',
      author_name: 'Radiohead - Topic',
      author_url: 'https://www.youtube.com/channel/abc',
      type: 'video',
      html: '<iframe></iframe>',
      thumbnail_url: 'https://i.ytimg.com/vi/x/hqdefault.jpg'
    })
    const result = await resolve(fetchFn)
    expect(result.status === 'found' && Object.keys(result.track).sort()).toEqual([
      'artist',
      'durationMs',
      'provider',
      'providerTrackId',
      'title'
    ])
  })

  it.each([
    'https://open.spotify.com/track/abc',
    'https://www.youtube.com/@Radiohead',
    `https://youtube.com.evil.test/watch?v=${ID}`,
    'not a url',
    ''
  ])("doesn't call YouTube for %s", async (url) => {
    const fetchFn = answering(200)
    expect(await resolve(fetchFn, url)).toEqual({ status: 'unsupported' })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it.each([400, 401, 403, 404])('treats a %i as not found', async (status) => {
    expect(await resolve(answering(status))).toEqual({ status: 'not_found' })
  })

  it('treats a plain-text error page as not found', async () => {
    const fetchFn = fetching(() => new Response('Not Found', { status: 404 }))
    expect(await resolve(fetchFn)).toEqual({ status: 'not_found' })
  })

  it.each([408, 429, 500, 502, 503])('throws when YouTube answers %i', async (status) => {
    await expect(resolve(answering(status))).rejects.toThrow(String(status))
  })

  it.each([
    ['no title', { author_name: 'Radiohead' }],
    ['no author', { title: 'Reckoner' }],
    ['a numeric title', { title: 42, author_name: 'Radiohead' }],
    ['a null author', { title: 'Reckoner', author_name: null }],
    ['an empty object', {}]
  ])('throws when the answer has %s', async (_, body) => {
    await expect(resolve(answering(200, body))).rejects.toThrow('without a title or author')
  })

  it("throws when the answer isn't JSON", async () => {
    const fetchFn = fetching(() => new Response('<html>oops</html>', { status: 200 }))
    await expect(resolve(fetchFn)).rejects.toThrow(SyntaxError)
  })

  it('throws when YouTube is unreachable', async () => {
    const fetchFn = fetching(() => Promise.reject(new TypeError('fetch failed')))
    await expect(resolve(fetchFn)).rejects.toThrow('fetch failed')
  })

  it('throws when the request times out', async () => {
    const fetchFn = fetching(() => Promise.reject(new DOMException('The operation timed out', 'TimeoutError')))
    await expect(resolve(fetchFn)).rejects.toThrow('timed out')
  })

  it('keeps simultaneous lookups apart', async () => {
    const fetchFn = vi.fn(async (input: string) => {
      const id = new URL(new URL(input).searchParams.get('url')!).searchParams.get('v')
      return new Response(JSON.stringify({ title: `Song ${id}`, author_name: 'Artist - Topic' }))
    }) as unknown as typeof fetch
    const resolver = new YouTubeResolver(fetchFn)
    const ids = Array.from({ length: 50 }, (_, i) => `id_${String(i).padStart(8, '0')}`)

    const results = await Promise.all(ids.map((id) => resolver.resolveUrl(`https://youtu.be/${id}`)))
    expect(results.map((r) => r.status === 'found' && [r.track.providerTrackId, r.track.title])).toEqual(
      ids.map((id) => [id, `Song ${id}`])
    )
  })
})
