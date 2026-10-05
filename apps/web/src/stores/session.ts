import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SessionResponse } from "@aux/shared";

type SessionState = {
  session: SessionResponse | null;
  setSession(session: SessionResponse): void;
  clear(): void;
};

// Kept in localStorage so a reload doesn't sign you out.
export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      session: null,
      setSession: (session) => set({ session }),
      clear: () => set({ session: null }),
    }),
    { name: "aux-session" },
  ),
);

export const isLive = (session: SessionResponse | null): session is SessionResponse =>
  session !== null && Date.parse(session.expiresAt) > Date.now();
