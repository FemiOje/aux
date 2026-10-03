import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { dropSchema, feedResponseSchema, type CreateDrop, type Drop, type FeedResponse } from "@aux/shared";
import { isLive, useSession } from "../stores/session";
import { apiGet, apiPost, apiSend } from "./client";

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

export function useDrop(id: string) {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: ["drop", id, viewerId],
    queryFn: () => apiGet(`/drops/${encodeURIComponent(id)}`, dropSchema),
    retry: false,
  });
}

export function useCreateDrop() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (drop: CreateDrop) => apiPost("/drops", drop, dropSchema),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["feed"] }),
  });
}

// The feed with one drop swapped for a newer copy of itself.
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
      queryClient.setQueryData(["drop", String(drop.id), viewerId], drop);
    },
  });
}
