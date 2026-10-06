import { useEffect, useRef } from "react";
import { useIdentityToken, useLogin, usePrivy } from "@privy-io/react-auth";
import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router";
import { createSession, deleteSession } from "../api/auth";
import { friendlyError } from "../api/errors";
import { profilePath } from "../api/users";
import { isLive, useSession } from "../stores/session";

export function AccountMenu() {
  const { ready, authenticated, logout } = usePrivy();
  const { login } = useLogin();
  const { identityToken } = useIdentityToken();
  const stored = useSession((s) => s.session);
  const setSession = useSession((s) => s.setSession);
  const clear = useSession((s) => s.clear);
  const session = isLive(stored) ? stored : null;

  const swap = useMutation({ mutationFn: createSession, onSuccess: setSession });
  const { mutate } = swap;
  // The token we last sent, so a re-render (or StrictMode's double effect) doesn't send it twice.
  const sent = useRef<string | null>(null);

  const hadSession = useRef(false);

  useEffect(() => {
    // The server turned our session away (see api/client), so the identity token may be swapped again.
    if (hadSession.current && !stored) sent.current = null;
    hadSession.current = stored !== null;

    if (!ready) return;
    if (!authenticated) {
      // Privy signed them out (or its session ran out), so ours goes too.
      if (stored) {
        void deleteSession(stored.token).catch(() => {});
        clear();
      }
      return;
    }
    if (session || !identityToken || sent.current === identityToken) return;
    sent.current = identityToken;
    mutate(identityToken);
  }, [ready, authenticated, identityToken, session, stored, clear, mutate]);

  // The server session goes first: if that fails we stay signed in, so "signed out" always means it is gone.
  const signOut = useMutation({
    mutationFn: async () => {
      if (stored) await deleteSession(stored.token);
      await logout();
      sent.current = null;
      swap.reset();
      clear();
    },
  });

  if (!ready) return null;
  if (!authenticated) {
    return (
      <div className="account">
        <button onClick={() => login()}>Sign in</button>
      </div>
    );
  }

  return (
    <div className="account">
      {session ? (
        <>
          <Link to="/saved">Saved</Link>
          <Link to={profilePath(session.user.handle)}>@{session.user.handle}</Link>
        </>
      ) : swap.isError ? (
        <>
          <span className="meta">{friendlyError(swap.error)}</span>
          {identityToken && <button onClick={() => mutate(identityToken)}>Try again</button>}
        </>
      ) : (
        <span className="meta">Signing in…</span>
      )}
      {signOut.isError && (
        <span className="meta" role="alert">
          We couldn't sign you out. Check your internet and try again.
        </span>
      )}
      <button onClick={() => signOut.mutate()} disabled={signOut.isPending}>
        {signOut.isPending ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}
