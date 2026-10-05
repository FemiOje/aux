import { afterEach, describe, expect, it, vi } from "vitest";
import type { Drop, Recording } from "@aux/shared";
import { postDrop, withDrop } from "./drops";

const drop = (id: number, saved = false): Drop => ({
  id,
  curator: { handle: "femi" },
  recording: { id: 7, title: "Reckoner", artist: "Radiohead", durationMs: null, tracks: [] },
  note: `note ${id}`,
  saveCount: saved ? 1 : 0,
  saved,
  createdAt: "2026-01-01T00:00:00.000Z",
});

describe("withDrop", () => {
  const feed = {
    pages: [
      { drops: [drop(4), drop(3)], nextCursor: "abc" },
      { drops: [drop(2), drop(1)], nextCursor: null },
    ],
    pageParams: [undefined, "abc"],
  };

  it("swaps the one drop, on whichever page it is", () => {
    const next = withDrop(feed, drop(2, true));
    expect(next?.pages.flatMap((p) => p.drops)).toEqual([drop(4), drop(3), drop(2, true), drop(1)]);
    expect(next?.pages.map((p) => p.nextCursor)).toEqual(["abc", null]);
    expect(next?.pageParams).toEqual(feed.pageParams);
  });

  it("leaves a feed without that drop as it was", () => {
    expect(withDrop(feed, drop(9, true))).toEqual(feed);
  });

  it("has nothing to do before the feed has loaded", () => {
    expect(withDrop(undefined, drop(1))).toBeUndefined();
  });
});

describe("postDrop", () => {
  const recording = (id: number, artist: string): Recording => ({ id, title: "Weird Fishes", artist, durationMs: null, tracks: [] });
  const unclear = { status: 422, body: { error: { code: "RECORDING_UNCLEAR", message: "dev text" } } };
  const link = "https://youtu.be/abc";

  // Answers each request in turn from the list, and records what was asked.
  function serverAnswering(...answers: { status: number; body: unknown }[]) {
    const seen: { path: string; body: unknown }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      seen.push({ path: url, body: JSON.parse(String(init.body)) });
      const answer = answers[seen.length - 1];
      if (!answer) throw new Error(`unexpected request to ${url}`);
      return new Response(JSON.stringify(answer.body), { status: answer.status });
    });
    return seen;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts a clear link in one request", async () => {
    const seen = serverAnswering({ status: 201, body: drop(1) });
    expect(await postDrop({ link, note: "n" })).toEqual({ drop: drop(1) });
    expect(seen).toEqual([{ path: "/api/drops", body: { link, note: "n" } }]);
  });

  it("hands back the close matches of an unclear link, and posts nothing", async () => {
    const matches = [recording(3, "Radiohead"), recording(9, "Lianne La Havas")];
    const seen = serverAnswering(unclear, { status: 200, body: { recording: null, matches } });
    expect(await postDrop({ link, note: "n" })).toEqual({ matches });
    expect(seen).toEqual([
      { path: "/api/drops", body: { link, note: "n" } },
      { path: "/api/catalog/resolve", body: { link } },
    ]);
  });

  it("posts the song the user picked", async () => {
    const seen = serverAnswering({ status: 201, body: drop(2) });
    expect(await postDrop({ recordingId: 3, note: "this one" })).toEqual({ drop: drop(2) });
    expect(seen).toEqual([{ path: "/api/drops", body: { recordingId: 3, note: "this one" } }]);
  });

  it("keeps the server's refusal when there is nothing to pick from", async () => {
    serverAnswering(unclear, { status: 200, body: { recording: null, matches: [] } });
    await expect(postDrop({ link, note: "n" })).rejects.toMatchObject({ code: "RECORDING_UNCLEAR" });
  });

  it("posts straight away when the link has become clear in the meantime", async () => {
    const seen = serverAnswering(
      unclear,
      { status: 200, body: { recording: recording(3, "Radiohead"), matches: [] } },
      { status: 201, body: drop(5) },
    );
    expect(await postDrop({ link, note: "n" })).toEqual({ drop: drop(5) });
    expect(seen[2]).toEqual({ path: "/api/drops", body: { recordingId: 3, note: "n" } });
  });

  it("doesn't look for matches after any other failure", async () => {
    const seen = serverAnswering({ status: 422, body: { error: { code: "UNSUPPORTED_LINK", message: "dev text" } } });
    await expect(postDrop({ link, note: "n" })).rejects.toMatchObject({ code: "UNSUPPORTED_LINK" });
    expect(seen).toHaveLength(1);
  });

  it("passes on a failure to fetch the matches", async () => {
    serverAnswering(unclear, { status: 502, body: { error: { code: "RESOLVER_UNAVAILABLE", message: "dev text" } } });
    await expect(postDrop({ link, note: "n" })).rejects.toMatchObject({ code: "RESOLVER_UNAVAILABLE" });
  });

  it("doesn't look for matches when a picked song is refused", async () => {
    const seen = serverAnswering(unclear);
    await expect(postDrop({ recordingId: 3, note: "n" })).rejects.toMatchObject({ code: "RECORDING_UNCLEAR" });
    expect(seen).toHaveLength(1);
  });
});
