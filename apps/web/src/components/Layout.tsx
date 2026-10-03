import { Link, Outlet } from "react-router";
import { AUTH_ENABLED } from "../auth/AuthProvider";
import { AccountMenu } from "./AccountMenu";
import { PLAYER_HOST_ID, useNowPlaying } from "../stores/nowPlaying";

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

function NowPlayingBar() {
  const drop = useNowPlaying((s) => s.drop);
  const status = useNowPlaying((s) => s.status);
  const positionMs = useNowPlaying((s) => s.positionMs);
  const visible = drop !== null && status !== "unplayable";

  return (
    <aside className="now-playing" hidden={!visible}>
      {/* The YouTube adapter mounts its iframe here. It stays mounted across pages so music keeps playing. */}
      <div id={PLAYER_HOST_ID} className="player-host" />
      {drop && (
        <p>
          <strong>{drop.recording.title}</strong> · {drop.recording.artist}
          <span className="meta"> {clock(positionMs)}</span>
        </p>
      )}
    </aside>
  );
}

export function Layout() {
  return (
    <>
      <header>
        <Link to="/">Aux</Link>
        {AUTH_ENABLED && <AccountMenu />}
      </header>
      <main>
        <Outlet />
      </main>
      <NowPlayingBar />
    </>
  );
}
