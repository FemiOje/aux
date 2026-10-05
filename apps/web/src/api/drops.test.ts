import { describe, expect, it } from "vitest";
import type { Drop } from "@aux/shared";
import { withDrop } from "./drops";

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
