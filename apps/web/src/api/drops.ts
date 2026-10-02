import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { dropSchema, feedResponseSchema } from "@aux/shared";
import { apiGet } from "./client";

export function useFeed() {
  return useInfiniteQuery({
    queryKey: ["feed"],
    queryFn: ({ pageParam }) =>
      apiGet(pageParam ? `/feed?cursor=${encodeURIComponent(pageParam)}` : "/feed", feedResponseSchema),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

export function useDrop(id: string) {
  return useQuery({
    queryKey: ["drop", id],
    queryFn: () => apiGet(`/drops/${encodeURIComponent(id)}`, dropSchema),
    retry: false,
  });
}
