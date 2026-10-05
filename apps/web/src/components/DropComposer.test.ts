import { describe, expect, it } from "vitest";
import { checkDrop, checkNote } from "./DropComposer";

describe("checkDrop", () => {
  it("passes a link with a note", () => {
    expect(checkDrop("https://youtu.be/abc", "Wait for the sax.")).toBeNull();
  });

  it.each([
    ["", "note", /Paste a link/],
    ["youtube dot com", "note", /doesn't look like a link/],
    ["https://youtu.be/abc", "", /Add a short note/],
    ["https://youtu.be/abc", "x".repeat(281), /too long/],
  ])("explains what to fix for (%j, %j)", (link, note, expected) => {
    expect(checkDrop(link, note)).toMatch(expected);
  });
});

describe("checkNote", () => {
  it("passes a note of the right length", () => {
    expect(checkNote("Wait for the sax.")).toBeNull();
    expect(checkNote("x".repeat(280))).toBeNull();
  });

  it.each([
    ["", /Add a short note/],
    ["x".repeat(281), /too long/],
  ])("explains what to fix for %j", (note, expected) => {
    expect(checkNote(note)).toMatch(expected);
  });
});
