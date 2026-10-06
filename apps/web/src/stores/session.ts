import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Me, SessionResponse } from "@aux/shared";

type SessionState = {
  session: SessionResponse | null;
  setSession(session: SessionResponse): void;
  // The signed-in user changed something about themselves. Does nothing if they have signed out meanwhile.
  setUser(user: Me): void;
  clear(): void;
};

// Kept in localStorage so a reload doesn't sign you out.
export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      session: null,
      setSession: (session) => set({ session }),
      setUser: (user) =>
        set(({ session }) => (session?.user.id === user.id ? { session: { ...session, user } } : { session })),
      clear: () => set({ session: null }),
    }),
    { name: "aux-session" },
  ),
);

export const isLive = (session: SessionResponse | null): session is SessionResponse =>
  session !== null && Date.parse(session.expiresAt) > Date.now();
