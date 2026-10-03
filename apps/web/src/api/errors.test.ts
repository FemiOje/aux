import { describe, expect, it } from "vitest";
import { ApiRequestError } from "./client";
import { friendlyError } from "./errors";

describe("friendlyError", () => {
  it("explains a known problem in plain words", () => {
    expect(friendlyError(new ApiRequestError(422, "UNSUPPORTED_LINK", "dev text"))).toMatch(/YouTube links/);
  });

  it("tells a dropped connection apart from a server fault", () => {
    expect(friendlyError(new TypeError("Failed to fetch"))).toMatch(/internet/);
    expect(friendlyError(new Error("schema mismatch"))).toMatch(/our side/);
  });

  it.each([
    new ApiRequestError(422, "UNSUPPORTED_LINK", "Only YouTube links work for now"),
    new ApiRequestError(400, "INVALID_BODY", "Send a link and a note of 1 to 280 characters"),
    new ApiRequestError(500, "SOME_NEW_CODE", "relation drops does not exist"),
    new ApiRequestError(502, "UNKNOWN", "Request failed (502)"),
  ])("never shows a status code, error code or server message: %s", (error) => {
    const text = friendlyError(error);
    expect(text).not.toContain(error.message);
    expect(text).not.toContain(error.code);
    expect(text).not.toMatch(/\d{3}/);
  });
});
