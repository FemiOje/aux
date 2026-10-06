import { Link } from "react-router";
import type { Drop } from "@aux/shared";
import { profilePath } from "../api/users";
import { PlayButton } from "./PlayButton";
import { SaveButton } from "./SaveButton";

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
          <Link to={profilePath(drop.curator.handle)}>@{drop.curator.handle}</Link> · {drop.saveCount} {drop.saveCount === 1 ? "save" : "saves"}
        </p>
        <SaveButton drop={drop} />
      </div>
    </article>
  );
}
