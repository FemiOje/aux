import { sessionResponseSchema } from "@aux/shared";
import { ApiRequestError, apiDelete, apiPost } from "./client";

// Swaps a Privy identity token for our session.
export function createSession(identityToken: string) {
  return apiPost("/auth/session", { token: identityToken }, sessionResponseSchema);
}

// Ends the session on the server, so the token stops working everywhere, not just in this browser.
export async function deleteSession(sessionToken: string) {
  try {
    await apiDelete("/auth/session", sessionToken);
  } catch (error) {
    // Already gone on the server, which is what we wanted.
    if (!(error instanceof ApiRequestError && error.status === 401)) throw error;
  }
}
