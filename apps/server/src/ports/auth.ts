// Who a sign-in token belongs to, according to the sign-in provider.
export type AuthIdentity = {
  // The provider's stable ID for this person (for Privy, a DID like "did:privy:abc").
  subject: string
  // null when they signed in without an email (e.g. passkey only).
  email: string | null
  // The wallet the provider made for them. null until it exists.
  walletAddress: string | null
}

// The checklist every sign-in adapter fulfils. Core code never calls a sign-in provider directly.
export interface AuthPort {
  // null means the token is invalid or expired. Throws when the provider can't be asked.
  verifyToken(token: string): Promise<AuthIdentity | null>
}
