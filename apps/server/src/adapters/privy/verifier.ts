import { InvalidAuthTokenError, PrivyClient, type User } from '@privy-io/node'
import type { AuthIdentity, AuthPort } from '../../ports/auth.js'

export function toIdentity(user: User): AuthIdentity {
  let email: string | null = null
  let walletAddress: string | null = null
  for (const account of user.linked_accounts) {
    if (account.type === 'email') email ??= account.address.toLowerCase()
    // Only the wallet Privy made for them, not one they connected from elsewhere.
    if (
      account.type === 'wallet' &&
      account.chain_type === 'ethereum' &&
      'wallet_client_type' in account &&
      account.wallet_client_type === 'privy'
    ) {
      walletAddress ??= account.address
    }
  }
  return { subject: user.id, email, walletAddress }
}

// Verifies Privy identity tokens (not access tokens: those don't carry the email or wallet).
export class PrivyVerifier implements AuthPort {
  private client?: PrivyClient

  constructor(
    private readonly appId = process.env.PRIVY_APP_ID,
    private readonly appSecret = process.env.PRIVY_APP_SECRET
  ) {}

  async verifyToken(token: string): Promise<AuthIdentity | null> {
    // Checked here, not at startup, so the rest of the API runs without Privy keys.
    if (!this.appId || !this.appSecret) throw new Error('PRIVY_APP_ID and PRIVY_APP_SECRET are not set')
    this.client ??= new PrivyClient({ appId: this.appId, appSecret: this.appSecret })

    try {
      return toIdentity(await this.client.users().get({ id_token: token }))
    } catch (err) {
      if (err instanceof InvalidAuthTokenError) return null
      throw err
    }
  }
}
