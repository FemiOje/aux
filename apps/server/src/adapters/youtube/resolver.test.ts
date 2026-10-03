import { describe, expect, it, vi } from 'vitest'
import { parseMetadata, parseVideoId, YouTubeResolver } from './resolver.js'

const ID = 'QXIxC6msiow'

const answering = (status: number, body: unknown = {}) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch

describe('parseVideoId', () => {
  it.each([
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?v=${ID}&t=42s`,
    `https://m.youtube.com/watch?feature=share&v=${ID}`,
    `https://music.youtube.com/watch?v=${ID}`,
    `https://youtu.be/${ID}?si=abc`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/embed/${ID}`
  ])('reads the id from %s', (url) => {
    expect(parseVideoId(url)).toBe(ID)
  })

  it.each([
    'https://open.spotify.com/track/abc',
    'https://www.youtube.com/@Radiohead',
    'https://www.youtube.com/watch?v=short',
    `https://notyoutube.com/watch?v=${ID}`,
    'not a url'
  ])('ignores %s', (url) => {
    expect(parseVideoId(url)).toBeNull()
  })
})

describe('parseMetadata', () => {
  it.each([
    ['Lagbaja – Konko Below (Official Lyric Video)', 'Mandara Entertainment', 'Konko Below', 'Lagbaja'],
    ['Radiohead - Weird Fishes/Arpeggi (Scotch Mist)', 'Radiohead', 'Weird Fishes/Arpeggi (Scotch Mist)', 'Radiohead'],
    ['Radiohead - Reckoner [HD]', 'someone', 'Reckoner', 'Radiohead'],
    ['Reckoner', 'Radiohead - Topic', 'Reckoner', 'Radiohead'],
    ['Jay-Z - 99 Problems', 'JayZVEVO', '99 Problems', 'Jay-Z']
  ])('%s by %s', (videoTitle, channel, title, artist) => {
    expect(parseMetadata(videoTitle, channel)).toEqual({ title, artist })
  })

  it("leaves the artist empty when it can't tell", () => {
    expect(parseMetadata('my favourite song ever', 'xX_fan_Xx')).toEqual({
      title: 'my favourite song ever',
      artist: null
    })
  })
})

describe('YouTubeResolver', () => {
  it('resolves a link through oEmbed', async () => {
    const fetchFn = answering(200, { title: 'Reckoner', author_name: 'Radiohead - Topic' })
    const result = await new YouTubeResolver(fetchFn).resolveUrl(`https://youtu.be/${ID}`)

    expect(result).toEqual({
      status: 'found',
      track: { provider: 'youtube', providerTrackId: ID, title: 'Reckoner', artist: 'Radiohead', durationMs: null }
    })
    expect(vi.mocked(fetchFn).mock.calls[0][0]).toContain(encodeURIComponent(`watch?v=${ID}`))
  })

  it("doesn't call YouTube for links that aren't YouTube's", async () => {
    const fetchFn = answering(200)
    expect(await new YouTubeResolver(fetchFn).resolveUrl('https://open.spotify.com/track/abc')).toEqual({
      status: 'unsupported'
    })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it.each([400, 401, 403, 404])('treats a %i as not found', async (status) => {
    const result = await new YouTubeResolver(answering(status)).resolveUrl(`https://youtu.be/${ID}`)
    expect(result).toEqual({ status: 'not_found' })
  })

  it('throws when YouTube is having trouble', async () => {
    await expect(new YouTubeResolver(answering(503)).resolveUrl(`https://youtu.be/${ID}`)).rejects.toThrow('503')
  })
})
