import { MutationObserver, QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Me, SessionResponse } from "@aux/shared";
import { useSession } from "../stores/session";
import { afterHandleChange, checkHandle, handleMutation, tidyHandle, updateHandle } from "./users";

const me = (handle: string, id = 1): Me => ({
  id,
  handle,
  email: "femi@example.com",
  walletAddress: null,
  preferredProvider: "youtube",
  createdAt: "2026-01-01T00:00:00.000Z",
});
const session = (user: Me): SessionResponse => ({
  token: "abc",
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  user,
});

describe("tidyHandle", () => {
  it.each([
    ["femi", "femi"],
    ["  Femi_Ade ", "femi_ade"],
    ["@femi", "femi"],
    [" @FEMI", "femi"],
    ["", ""],
  ])("turns %j into %j", (typed, expected) => {
    expect(tidyHandle(typed)).toBe(expected);
  });

  it("takes off only the one @ people type out of habit", () => {
    expect(checkHandle(tidyHandle("@@femi"))).toMatch(/letters, numbers and underscores/);
    expect(checkHandle(tidyHandle("fe@mi"))).toMatch(/letters, numbers and underscores/);
  });
});

describe("checkHandle", () => {
  it.each(["abc", "femi_ade", "a1_", "x".repeat(20)])("passes %j", (handle) => {
    expect(checkHandle(handle)).toBeNull();
  });

  it.each([
    ["", /Type the handle/],
    ["ab", /too short/],
    ["x".repeat(21), /too long/],
    ["two words", /letters, numbers and underscores/],
    ["dash-ed", /letters, numbers and underscores/],
    ["émile", /letters, numbers and underscores/],
    // Says what's wrong with the characters first: shortening it wouldn't fix it.
    ["a b", /letters, numbers and underscores/],
    ["!", /letters, numbers and underscores/],
  ])("explains what to fix for %j", (handle, expected) => {
    expect(checkHandle(handle)).toMatch(expected);
  });

  it("agrees with what the server accepts", async () => {
    const { handleSchema } = await import("@aux/shared");
    for (const handle of ["abc", "ab", "x".repeat(20), "x".repeat(21), "a b", "a-b", "a_b", "émile", "123", ""]) {
      expect(checkHandle(handle) === null, handle).toBe(handleSchema.safeParse(handle).success);
    }
  });
});

describe("updateHandle", () => {
  // Answers the one request, and records what it was.
  function serverAnswering(status: number, body: unknown) {
    const seen: { path: string; method?: string; authorization: string | null; body: unknown }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      seen.push({
        path: url,
        method: init.method,
        authorization: new Headers(init.headers).get("Authorization"),
        body: JSON.parse(String(init.body)),
      });
      return new Response(JSON.stringify(body), { status });
    });
    return seen;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    useSession.getState().clear();
  });

  it("sends the new handle as the signed-in user, and nothing else", async () => {
    useSession.getState().setSession(session(me("femi")));
    const seen = serverAnswering(200, me("femi_ade"));
    expect(await updateHandle("femi_ade")).toEqual(me("femi_ade"));
    expect(seen).toEqual([
      { path: "/api/me", method: "PATCH", authorization: "Bearer abc", body: { handle: "femi_ade" } },
    ]);
  });

  it("shows the new handle from then on, and stays signed in", async () => {
    const before = session(me("femi"));
    useSession.getState().setSession(before);
    serverAnswering(200, me("femi_ade"));
    await updateHandle("femi_ade");
    expect(useSession.getState().session).toEqual({ ...before, user: me("femi_ade") });
  });

  it("keeps the old handle when the new one is taken", async () => {
    useSession.getState().setSession(session(me("femi")));
    serverAnswering(409, { error: { code: "HANDLE_TAKEN", message: "dev text" } });
    await expect(updateHandle("ada")).rejects.toMatchObject({ code: "HANDLE_TAKEN" });
    expect(useSession.getState().session?.user.handle).toBe("femi");
  });

  it("leaves a signed-out browser signed out", async () => {
    serverAnswering(200, me("femi_ade"));
    await updateHandle("femi_ade");
    expect(useSession.getState().session).toBeNull();
  });

  it("doesn't put one person's handle on another person's session", async () => {
    useSession.getState().setSession(session(me("ada", 2)));
    serverAnswering(200, me("femi_ade", 1));
    await updateHandle("femi_ade");
    expect(useSession.getState().session?.user).toEqual(me("ada", 2));
  });
});

describe("afterHandleChange", () => {
  const profile = (handle: string) => ({ handle, createdAt: "2026-01-01T00:00:00.000Z" });

  // A page that is open on a query, the way the profile page is open on the old handle.
  function watching(queryClient: QueryClient, queryKey: unknown[], data: unknown) {
    queryClient.setQueryData(queryKey, data);
    const queryFn = vi.fn(async () => data);
    const observer = new QueryObserver(queryClient, { queryKey, queryFn, staleTime: Infinity });
    const stop = observer.subscribe(() => {});
    return { queryFn, stop };
  }

  it("doesn't ask for the old profile again while its page is still open", async () => {
    const queryClient = new QueryClient();
    const oldProfile = watching(queryClient, ["profile", "hello1"], profile("hello1"));
    const oldDrops = watching(queryClient, ["dropsBy", 1, "hello1"], { pages: [], pageParams: [] });

    afterHandleChange(queryClient, me("hello2"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(oldProfile.queryFn).not.toHaveBeenCalled();
    expect(oldDrops.queryFn).not.toHaveBeenCalled();
    // Still out of date, so opening the old address later asks the server and finds nobody there.
    expect(queryClient.getQueryState(["profile", "hello1"])?.isInvalidated).toBe(true);
    oldProfile.stop();
    oldDrops.stop();
  });

  it("has the new profile ready to show", () => {
    const queryClient = new QueryClient();
    afterHandleChange(queryClient, me("hello2"));
    expect(queryClient.getQueryData(["profile", "hello2"])).toEqual(profile("hello2"));
  });

  it("reloads the lists of drops that show the old handle", async () => {
    const queryClient = new QueryClient();
    const feed = watching(queryClient, ["feed", 1], { pages: [], pageParams: [] });
    const drop = watching(queryClient, ["drop", "7", 1], {});

    afterHandleChange(queryClient, me("hello2"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(feed.queryFn).toHaveBeenCalledTimes(1);
    expect(drop.queryFn).toHaveBeenCalledTimes(1);
    feed.stop();
    drop.stop();
  });

  it("returns without waiting, so the page can move on at once", () => {
    expect(afterHandleChange(new QueryClient(), me("hello2"))).toBeUndefined();
  });
});

describe("handleMutation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    useSession.getState().clear();
  });

  it("moves to the new address even though the form goes away as soon as the session has the new handle", async () => {
    useSession.getState().setSession(session(me("hello1")));
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify(me("hello2")), { status: 200 }));
    const queryClient = new QueryClient();
    const onChanged = vi.fn();

    // The form, as React Query sees it: it watches the change, and stops watching when it is taken off the page.
    const form = new MutationObserver(queryClient, handleMutation(queryClient, onChanged));
    const unmount = form.subscribe(() => {});
    // The profile page takes the form away once the signed-in handle no longer matches the profile it shows.
    const stopWatching = useSession.subscribe((s) => {
      if (s.session?.user.handle !== "hello1") unmount();
    });

    void form.mutate("hello2");
    await vi.waitFor(() => expect(useSession.getState().session?.user.handle).toBe("hello2"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onChanged).toHaveBeenCalledExactlyOnceWith(me("hello2"));
    stopWatching();
  });

  it("stays put when the handle is taken", async () => {
    useSession.getState().setSession(session(me("hello1")));
    vi.stubGlobal(
      "fetch",
      async () => new Response(JSON.stringify({ error: { code: "HANDLE_TAKEN", message: "dev text" } }), { status: 409 }),
    );
    const queryClient = new QueryClient();
    const onChanged = vi.fn();
    const form = new MutationObserver(queryClient, handleMutation(queryClient, onChanged));

    await expect(form.mutate("ada")).rejects.toMatchObject({ code: "HANDLE_TAKEN" });
    expect(onChanged).not.toHaveBeenCalled();
  });
});
