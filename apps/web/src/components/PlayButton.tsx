import type { Drop } from "@aux/shared";
import { useNowPlaying } from "../stores/nowPlaying";

const searchUrl = ({ recording }: Drop) =>
  `https://www.youtube.com/results?search_query=${encodeURIComponent(`${recording.artist} ${recording.title}`)}`;

export function PlayButton({ drop }: { drop: Drop }) {
  const status = useNowPlaying((s) => (s.drop?.id === drop.id ? s.status : "idle"));
  const toggle = useNowPlaying((s) => s.toggle);

  // Never a dead play button: when nothing can play it here, link out instead.
  if (status === "unplayable") {
    return (
      <a className="play" href={searchUrl(drop)} target="_blank" rel="noreferrer">
        Open on YouTube ↗
      </a>
    );
  }

  return (
    <button className="play" onClick={() => toggle(drop)} disabled={status === "loading"}>
      {status === "loading" ? "Loading…" : status === "playing" ? "Pause" : "Play"}
    </button>
  );
}
