import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import {
  dropSchema,
  feedResponseSchema,
  resolveResponseSchema,
  type CreateDrop,
  type Drop,
  type FeedResponse,
  type Recording,
} from "@aux/shared";
import { isLive, useSession } from "../stores/session";
import { ApiRequestError, apiGet, apiPost, apiSend } from "./client";

// Drops come back with `saved` for whoever is signed in, so each user (and signed-out) gets their own cache.
const useViewerId = () => useSession((s) => (isLive(s.session) ? s.session.user.id : null));

export function useFeed() {
  const viewerId = useViewerId();
  return useInfiniteQuery({
    queryKey: ["feed", viewerId],
    queryFn: ({ pageParam }) =>
      apiGet(pageParam ? `/feed?cursor=${encodeURIComponent(pageParam)}` : "/feed", feedResponseSchema),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

// The drops the signed-in user saved, most recently saved first. Asks for nothing while signed out.
export function useSaved() {
  const viewerId = useViewerId();
  return useInfiniteQuery({
    queryKey: ["saved", viewerId],
    queryFn: ({ pageParam }) =>
      apiGet(pageParam ? `/me/saved?cursor=${encodeURIComponent(pageParam)}` : "/me/saved", feedResponseSchema),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: viewerId !== null,
  });
}

// The drops one person posted, newest first, for their profile.
export function useDropsBy(handle: string) {
  const viewerId = useViewerId();
  const path = `/users/${encodeURIComponent(handle)}/drops`;
  return useInfiniteQuery({
    queryKey: ["dropsBy", viewerId, handle],
    queryFn: ({ pageParam }) =>
      apiGet(pageParam ? `${path}?cursor=${encodeURIComponent(pageParam)}` : path, feedResponseSchema),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

export function useDrop(id: string) {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: ["drop", id, viewerId],
    queryFn: () => apiGet(`/drops/${encodeURIComponent(id)}`, dropSchema),
    retry: false,
  });
}

// How posting ended: with a drop, or with the songs the link might be, for the user to pick one.
export type PostDropResult = { drop: Drop } | { matches: Recording[] };

// Posts a drop. When the server can't tell which song a link is, asks it for the close matches instead.
// With no close matches there is nothing to pick from, so the server's refusal stands.
export async function postDrop(drop: CreateDrop): Promise<PostDropResult> {
  try {
    return { drop: await apiPost("/drops", drop, dropSchema) };
  } catch (error) {
    const unclear = error instanceof ApiRequestError && error.code === "RECORDING_UNCLEAR";
    if (!unclear || !("link" in drop)) throw error;

    const { recording, matches } = await apiPost("/catalog/resolve", { link: drop.link }, resolveResponseSchema);
    // Someone added the song between our two requests, so the link is clear now.
    if (recording) return postDrop({ recordingId: recording.id, note: drop.note });
    if (matches.length === 0) throw error;
    return { matches };
  }
}

export function useCreateDrop() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: postDrop,
    onSuccess: (result) => {
      if ("drop" in result) return queryClient.invalidateQueries({ queryKey: ["feed"] });
    },
  });
}

// A list of drops (the feed, or the saved list) with one drop swapped for a newer copy of itself.
export function withDrop(
  feed: InfiniteData<FeedResponse> | undefined,
  drop: Drop,
): InfiniteData<FeedResponse> | undefined {
  return (
    feed && {
      ...feed,
      pages: feed.pages.map((page) => ({ ...page, drops: page.drops.map((d) => (d.id === drop.id ? drop : d)) })),
    }
  );
}

// Saves the drop, or unsaves it if it is already saved. The server answers with the drop's new save count.
export function useToggleSave() {
  const queryClient = useQueryClient();
  const viewerId = useViewerId();
  return useMutation({
    mutationFn: (drop: Drop) => apiSend(drop.saved ? "DELETE" : "POST", `/drops/${drop.id}/save`, dropSchema),
    onSuccess: (drop) => {
      queryClient.setQueryData<InfiniteData<FeedResponse>>(["feed", viewerId], (feed) => withDrop(feed, drop));
      // An unsaved drop stays on the saved list, with its Save button, until the list is next loaded.
      // That leaves a mis-tap one tap away from being undone.
      queryClient.setQueryData<InfiniteData<FeedResponse>>(["saved", viewerId], (saved) => withDrop(saved, drop));
      // Every profile this viewer has open.
      queryClient.setQueriesData<InfiniteData<FeedResponse>>({ queryKey: ["dropsBy", viewerId] }, (list) =>
        withDrop(list, drop),
      );
      queryClient.setQueryData(["drop", String(drop.id), viewerId], drop);
    },
  });
}
