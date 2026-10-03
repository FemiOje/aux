import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionResponse } from "@aux/shared";
import { useSession } from "../stores/session";
import { apiGet, apiPost } from "./client";

const anything = { parse: (data: unknown) => data };
const session = (token: string, expiresAt = new Date(Date.now() + 60_000).toISOString()): SessionResponse => ({
  token,
  expiresAt,
  user: { id: 1, handle: "femi", email: "femi@example.com", walletAddress: null, preferredProvider: "youtube", createdAt: expiresAt },
});

// Answers every request with this status, and records the Authorization header it was sent.
function serverAnswering(status: number, body: unknown = {}) {
  const seen: (string | null)[] = [];
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    seen.push(new Headers(init.headers).get("Authorization"));
    return new Response(JSON.stringify(body), { status });
  });
  return seen;
}

afterEach(() => {
  vi.unstubAllGlobals();
  useSession.getState().clear();
});

describe("session token", () => {
  it("is sent on every request while the session is live", async () => {
    const seen = serverAnswering(200);
    useSession.getState().setSession(session("abc"));
    await apiGet("/feed", anything);
    await apiPost("/drops", {}, anything);
    expect(seen).toEqual(["Bearer abc", "Bearer abc"]);
  });

  it("is left off when signed out or expired", async () => {
    const seen = serverAnswering(200);
    await apiGet("/feed", anything);
    useSession.getState().setSession(session("old", new Date(Date.now() - 1000).toISOString()));
    await apiGet("/feed", anything);
    expect(seen).toEqual([null, null]);
  });

  it("is dropped when the server turns it away", async () => {
    serverAnswering(401, { error: { code: "UNAUTHENTICATED", message: "Sign in to continue" } });
    useSession.getState().setSession(session("abc"));
    await expect(apiGet("/me", anything)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(useSession.getState().session).toBeNull();
  });

  it("survives a 401 that wasn't about it", async () => {
    serverAnswering(401, { error: { code: "INVALID_TOKEN", message: "x" } });
    await expect(apiPost("/auth/session", {}, anything)).rejects.toMatchObject({ code: "INVALID_TOKEN" });
    useSession.getState().setSession(session("abc"));
    serverAnswering(500);
    await expect(apiGet("/feed", anything)).rejects.toMatchObject({ status: 500 });
    expect(useSession.getState().session?.token).toBe("abc");
  });
});
