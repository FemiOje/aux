import { useEffect, useRef } from "react";
import { useIdentityToken, useLogin, usePrivy } from "@privy-io/react-auth";
import { useMutation } from "@tanstack/react-query";
import { createSession } from "../api/auth";
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

  useEffect(() => {
    if (!ready) return;
    if (!authenticated) {
      // Privy signed them out (or its session ran out), so ours goes too.
      if (stored) clear();
      return;
    }
    if (session || !identityToken || sent.current === identityToken) return;
    sent.current = identityToken;
    mutate(identityToken);
  }, [ready, authenticated, identityToken, session, stored, clear, mutate]);

  const signOut = async () => {
    await logout();
    sent.current = null;
    swap.reset();
    clear();
  };

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
        <span>@{session.user.handle}</span>
      ) : swap.isError ? (
        <>
          <span className="meta">{swap.error.message}</span>
          {identityToken && <button onClick={() => mutate(identityToken)}>Try again</button>}
        </>
      ) : (
        <span className="meta">Signing in…</span>
      )}
      <button onClick={signOut}>Sign out</button>
    </div>
  );
}
