import type { ReactNode } from "react";
import { PrivyProvider } from "@privy-io/react-auth";

const APP_ID: string | undefined = import.meta.env.VITE_PRIVY_APP_ID;

// Without a Privy app ID the app still runs, just with no way to sign in.
export const AUTH_ENABLED = Boolean(APP_ID);

export function AuthProvider({ children }: { children: ReactNode }) {
  if (!APP_ID) return children;

  return (
    <PrivyProvider
      appId={APP_ID}
      config={{
        // Email only: the server needs an email to create the user.
        loginMethods: ["email"],
        embeddedWallets: { ethereum: { createOnLogin: "all-users" } },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
