import type { ProviderTrack, Recording } from "@aux/shared";
import type { PlaybackPort } from "./port";

// YouTube is the universal fallback: full songs for anyone, no account needed.
const FALLBACK_ORDER = ["youtube"];

export class PlayerManager {
  private current: PlaybackPort | null = null;

  constructor(private readonly adapters: Record<string, PlaybackPort>) {}

  // The recording's tracks we have an adapter for, preferred service first.
  candidates(recording: Recording, preferredProvider?: string): ProviderTrack[] {
    const order = [...new Set([...(preferredProvider ? [preferredProvider] : []), ...FALLBACK_ORDER])];
    return order.flatMap((provider) =>
      provider in this.adapters ? recording.tracks.filter((t) => t.provider === provider) : [],
    );
  }

  // Walks the candidates until one plays. Returns that track, or null when nothing could play.
  async play(recording: Recording, preferredProvider?: string, atMs?: number): Promise<ProviderTrack | null> {
    await this.pause();

    for (const track of this.candidates(recording, preferredProvider)) {
      const adapter = this.adapters[track.provider];
      try {
        await adapter.load(track);
        await adapter.play(atMs);
        this.current = adapter;
        return track;
      } catch {
        // Fall through to the next candidate.
      }
    }
    return null;
  }

  async resume(): Promise<void> {
    await this.current?.play();
  }

  async pause(): Promise<void> {
    await this.current?.pause().catch(() => {});
  }
}
