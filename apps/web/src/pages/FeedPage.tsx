import { useFeed } from "../api/drops";
import { DropCard } from "../components/DropCard";

export function FeedPage() {
  const { data, error, status, fetchNextPage, hasNextPage, isFetchingNextPage } = useFeed();

  if (status === "pending") return <p>Loading…</p>;
  if (status === "error") return <p role="alert">Couldn't load the feed: {error.message}</p>;

  const drops = data.pages.flatMap((page) => page.drops);
  if (drops.length === 0) return <p>No drops yet.</p>;

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
