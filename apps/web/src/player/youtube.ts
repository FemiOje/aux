import type { ProviderTrack } from "@aux/shared";
import type { PlaybackPort } from "./port";

// The slice of the YouTube IFrame Player API this adapter uses.
// https://developers.google.com/youtube/iframe_api_reference
type YTPlayer = {
  cueVideoById(videoId: string): void;
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getPlayerState(): number;
};
type YTNamespace = {
  Player: new (
    element: HTMLElement,
    options: {
      width: string;
      height: string;
      playerVars: Record<string, number>;
      events: {
        onReady: () => void;
        onStateChange: (event: { data: number }) => void;
        onError: (event: { data: number }) => void;
      };
    },
  ) => YTPlayer;
};
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const PLAYING = 1;
const CUED = 5;
const LOAD_TIMEOUT_MS = 10_000;
// Browsers may block autoplay; after this long we assume the user has to press play in the embed.
const PLAY_GRACE_MS = 4_000;
const PROGRESS_INTERVAL_MS = 500;

let api: Promise<YTNamespace> | null = null;

function loadApi(): Promise<YTNamespace> {
  api ??= new Promise((resolve, reject) => {
    window.onYouTubeIframeAPIReady = () => resolve(window.YT!);
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.onerror = () => {
      api = null;
      reject(new Error("Could not load the YouTube player"));
    };
    document.head.append(script);
  });
  return api;
}

export class YouTubePlayback implements PlaybackPort {
  capabilities = { fullTrack: true, canSeek: true, needsLogin: false };

  private player: Promise<YTPlayer> | null = null;
  private stateListeners = new Set<(state: number) => void>();
  private errorListeners = new Set<(code: number) => void>();

  // The player's iframe is created inside the element this returns.
  constructor(private readonly host: () => HTMLElement | null) {}

  private getPlayer(): Promise<YTPlayer> {
    this.player ??= loadApi().then(
      (YT) =>
        new Promise<YTPlayer>((resolve, reject) => {
          const host = this.host();
          if (!host) return reject(new Error("No element to put the YouTube player in"));
          // YT.Player replaces the element it is given, so hand it one React doesn't own.
          const target = host.appendChild(document.createElement("div"));
          const player = new YT.Player(target, {
            width: "100%",
            height: "100%",
            playerVars: { playsinline: 1 },
            events: {
              onReady: () => resolve(player),
              onStateChange: (e) => this.stateListeners.forEach((l) => l(e.data)),
              onError: (e) => this.errorListeners.forEach((l) => l(e.data)),
            },
          });
        }),
    );
    this.player.catch(() => (this.player = null));
    return this.player;
  }

  // Resolves when the player reaches `state`, rejects on a player error.
  private waitForState(state: number, timeoutMs: number, onTimeout: "resolve" | "reject"): Promise<void> {
    return new Promise((resolve, reject) => {
      const done = (fn: () => void) => {
        clearTimeout(timer);
        this.stateListeners.delete(onState);
        this.errorListeners.delete(onError);
        fn();
      };
      const onState = (s: number) => s === state && done(resolve);
      const onError = (code: number) => done(() => reject(new Error(`YouTube player error ${code}`)));
      const timer = setTimeout(
        () => done(onTimeout === "resolve" ? resolve : () => reject(new Error("YouTube player timed out"))),
        timeoutMs,
      );
      this.stateListeners.add(onState);
      this.errorListeners.add(onError);
    });
  }

  async load(track: ProviderTrack): Promise<void> {
    const player = await this.getPlayer();
    const cued = this.waitForState(CUED, LOAD_TIMEOUT_MS, "reject");
    player.cueVideoById(track.providerTrackId);
    await cued;
  }

  async play(atMs?: number): Promise<void> {
    const player = await this.getPlayer();
    if (player.getPlayerState() === PLAYING && atMs === undefined) return;
    // Videos that can't be embedded only report it once playback starts.
    const playing = this.waitForState(PLAYING, PLAY_GRACE_MS, "resolve");
    if (atMs !== undefined) player.seekTo(atMs / 1000, true);
    player.playVideo();
    await playing;
  }

  async pause(): Promise<void> {
    if (!this.player) return;
    (await this.player).pauseVideo();
  }

  onProgress(callback: (ms: number) => void): () => void {
    const timer = setInterval(async () => {
      const player = await this.player?.catch(() => null);
      if (player?.getPlayerState() === PLAYING) callback(player.getCurrentTime() * 1000);
    }, PROGRESS_INTERVAL_MS);
    return () => clearInterval(timer);
  }
}
