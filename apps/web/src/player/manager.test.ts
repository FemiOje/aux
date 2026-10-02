import { describe, expect, it, vi } from "vitest";
import type { Recording } from "@aux/shared";
import { PlayerManager } from "./manager";
import type { PlaybackPort } from "./port";

function fakeAdapter(overrides: Partial<PlaybackPort> = {}): PlaybackPort {
  return {
    capabilities: { fullTrack: true, canSeek: true, needsLogin: false },
    load: vi.fn(async () => {}),
    play: vi.fn(async () => {}),
    pause: vi.fn(async () => {}),
    onProgress: () => () => {},
    ...overrides,
  };
}

const recording: Recording = {
  id: 1,
  title: "Weird Fishes/Arpeggi",
  artist: "Radiohead",
  durationMs: 318000,
  tracks: [
    { provider: "youtube", providerTrackId: "yt" },
    { provider: "spotify", providerTrackId: "sp" },
  ],
};

describe("PlayerManager", () => {
  it("plays on the preferred service when it has an adapter", async () => {
    const youtube = fakeAdapter();
    const spotify = fakeAdapter();
    const manager = new PlayerManager({ youtube, spotify });

    expect(await manager.play(recording, "spotify")).toEqual({ provider: "spotify", providerTrackId: "sp" });
    expect(youtube.load).not.toHaveBeenCalled();
  });

  it("falls back to YouTube when the preferred service fails", async () => {
    const youtube = fakeAdapter();
    const spotify = fakeAdapter({ load: vi.fn(async () => Promise.reject(new Error("needs login"))) });
    const manager = new PlayerManager({ youtube, spotify });

    expect(await manager.play(recording, "spotify")).toEqual({ provider: "youtube", providerTrackId: "yt" });
  });

  it("skips services it has no adapter for", async () => {
    const manager = new PlayerManager({ youtube: fakeAdapter() });
    expect(manager.candidates(recording, "spotify")).toEqual([{ provider: "youtube", providerTrackId: "yt" }]);
  });

  it("returns null when nothing can play, so the UI can show a link instead", async () => {
    const youtube = fakeAdapter({ play: vi.fn(async () => Promise.reject(new Error("embedding disabled"))) });
    const manager = new PlayerManager({ youtube });

    expect(await manager.play(recording)).toBeNull();
    expect(await manager.play({ ...recording, tracks: [] })).toBeNull();
  });

  it("pauses what was playing before starting something else", async () => {
    const youtube = fakeAdapter();
    const manager = new PlayerManager({ youtube });

    await manager.play(recording);
    await manager.play(recording);
    expect(youtube.pause).toHaveBeenCalledTimes(1);
  });

  it("passes the start position through", async () => {
    const youtube = fakeAdapter();
    await new PlayerManager({ youtube }).play(recording, undefined, 42_000);
    expect(youtube.play).toHaveBeenCalledWith(42_000);
  });
});
