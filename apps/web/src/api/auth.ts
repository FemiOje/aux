import { sessionResponseSchema } from "@aux/shared";
import { apiPost } from "./client";

// Swaps a Privy identity token for our session.
export function createSession(identityToken: string) {
  return apiPost("/auth/session", { token: identityToken }, sessionResponseSchema);
}
