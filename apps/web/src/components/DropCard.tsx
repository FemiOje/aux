import { Link } from "react-router";
import type { Drop } from "@aux/shared";
import { PlayButton } from "./PlayButton";

export function DropCard({ drop }: { drop: Drop }) {
  return (
    <article className="drop">
      <PlayButton drop={drop} />
      <div>
        <h2>
          <Link to={`/drops/${drop.id}`}>{drop.recording.title}</Link>
        </h2>
        <p className="artist">{drop.recording.artist}</p>
        <p className="note">“{drop.note}”</p>
        <p className="meta">
          @{drop.curator.handle} · {drop.saveCount} {drop.saveCount === 1 ? "save" : "saves"}
        </p>
      </div>
    </article>
  );
}
