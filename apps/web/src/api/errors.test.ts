import { describe, expect, it } from "vitest";
import { ApiRequestError } from "./client";
import { friendlyError } from "./errors";

describe("friendlyError", () => {
  it("explains a known problem in plain words", () => {
    expect(friendlyError(new ApiRequestError(422, "UNSUPPORTED_LINK", "dev text"))).toMatch(/YouTube links/);
  });

  it("asks for the link again when a picked song has gone", () => {
    expect(friendlyError(new ApiRequestError(404, "RECORDING_NOT_FOUND", "dev text"))).toMatch(/Paste the link again/);
  });

  it("says what to do about a handle that is taken, and about a profile that isn't there", () => {
    expect(friendlyError(new ApiRequestError(409, "HANDLE_TAKEN", "dev text"))).toMatch(/Try another one/);
    expect(friendlyError(new ApiRequestError(404, "USER_NOT_FOUND", "dev text"))).toMatch(/can't find anyone/);
  });

  it("tells a dropped connection apart from a server fault", () => {
    expect(friendlyError(new TypeError("Failed to fetch"))).toMatch(/internet/);
    expect(friendlyError(new Error("schema mismatch"))).toMatch(/our side/);
  });

  it.each([
    new ApiRequestError(422, "UNSUPPORTED_LINK", "Only YouTube links work for now"),
    new ApiRequestError(400, "INVALID_BODY", "Send a link and a note of 1 to 280 characters"),
    new ApiRequestError(404, "RECORDING_NOT_FOUND", "Recording 12 does not exist"),
    new ApiRequestError(409, "HANDLE_TAKEN", "The handle femi is taken"),
    new ApiRequestError(404, "USER_NOT_FOUND", "No user with the handle femi"),
    new ApiRequestError(500, "SOME_NEW_CODE", "relation drops does not exist"),
    new ApiRequestError(502, "UNKNOWN", "Request failed (502)"),
  ])("never shows a status code, error code or server message: %s", (error) => {
    const text = friendlyError(error);
    expect(text).not.toContain(error.message);
    expect(text).not.toContain(error.code);
    expect(text).not.toMatch(/\d{3}/);
  });
});
