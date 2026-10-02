import { Link, useParams } from "react-router";
import { useDrop } from "../api/drops";
import { DropCard } from "../components/DropCard";

export function DropPage() {
  const { id = "" } = useParams();
  const { data: drop, error, status } = useDrop(id);

  if (status === "pending") return <p>Loading…</p>;
  if (status === "error") {
    return (
      <>
        <p role="alert">{error.message}</p>
        <Link to="/">Back to the feed</Link>
      </>
    );
  }

  return <DropCard drop={drop} />;
}
