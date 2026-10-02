import { create } from "zustand";
import type { Drop } from "@aux/shared";
import { PlayerManager } from "../player/manager";
import { YouTubePlayback } from "../player/youtube";

export const PLAYER_HOST_ID = "player-host";

const youtube = new YouTubePlayback(() => document.getElementById(PLAYER_HOST_ID));
const manager = new PlayerManager({ youtube });

type Status = "idle" | "loading" | "playing" | "paused" | "unplayable";

type NowPlaying = {
  drop: Drop | null;
  status: Status;
  positionMs: number;
  toggle(drop: Drop): Promise<void>;
};

export const useNowPlaying = create<NowPlaying>((set, get) => ({
  drop: null,
  status: "idle",
  positionMs: 0,

  async toggle(drop) {
    const { drop: current, status } = get();
    const isCurrent = current?.id === drop.id;

    if (isCurrent && status === "loading") return;
    if (isCurrent && status === "playing") {
      await manager.pause();
      return set({ status: "paused" });
    }
    if (isCurrent && status === "paused") {
      await manager.resume();
      return set({ status: "playing" });
    }

    set({ drop, status: "loading", positionMs: 0 });
    const track = await manager.play(drop.recording);
    // Another drop may have been started while this one was loading.
    if (get().drop?.id === drop.id) set({ status: track ? "playing" : "unplayable" });
  },
}));

youtube.onProgress((positionMs) => useNowPlaying.setState({ positionMs }));
