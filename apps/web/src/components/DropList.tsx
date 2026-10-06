import type { InfiniteData, UseInfiniteQueryResult } from "@tanstack/react-query";
import type { FeedResponse } from "@aux/shared";
import { friendlyError } from "../api/errors";
import { DropCard } from "./DropCard";

type Props = {
  query: UseInfiniteQueryResult<InfiniteData<FeedResponse>>;
  empty: string; // list has loaded and is empty.
};

// A paged list of drops, for the feed and for the drops you saved.
export function DropList({ query, empty }: Props) {
  const { data, error, status, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } = query;

  if (status === "pending") return <p>Loading…</p>;
  if (status === "error") {
    return (
      <>
        <p role="alert">{friendlyError(error)}</p>
        <button onClick={() => refetch()}>Try again</button>
      </>
    );
  }

  const drops = data.pages.flatMap((page) => page.drops);
  if (drops.length === 0) return <p>{empty}</p>;

  return (
    <>
      {drops.map((drop) => (
        <DropCard key={drop.id} drop={drop} />
      ))}
      {hasNextPage && (
        <button onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
          {isFetchingNextPage ? "Loading more…" : "Load more"}
        </button>
      )}
    </>
  );
}
