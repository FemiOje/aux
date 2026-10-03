import { useFeed } from "../api/drops";
import { friendlyError } from "../api/errors";
import { AUTH_ENABLED } from "../auth/AuthProvider";
import { DropCard } from "../components/DropCard";
import { DropComposer } from "../components/DropComposer";

function Feed() {
  const { data, error, status, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } = useFeed();

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

export function FeedPage() {
  return (
    <>
      {AUTH_ENABLED && <DropComposer />}
      <Feed />
    </>
  );
}
