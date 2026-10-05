import type { ProviderTrack } from "@aux/shared";

// The checklist every playback adapter fulfils. Nothing outside src/player/ talks to a music service.
export interface PlaybackPort {
  capabilities: { fullTrack: boolean; canSeek: boolean; needsLogin: boolean };
  load(track: ProviderTrack): Promise<void>; // get the song ready
  play(atMs?: number): Promise<void>; // start, optionally from a position
  pause(): Promise<void>;
  onProgress(callback: (ms: number) => void): () => void; // returns an unsubscribe function
}
