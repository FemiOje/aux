import { describe, expect, it } from 'vitest'
import type { User } from '@privy-io/node'
import { PrivyVerifier, toIdentity } from './verifier.js'

const user = (linked_accounts: unknown[]) =>
  ({ id: 'did:privy:abc', linked_accounts, mfa_methods: [], created_at: 0, has_accepted_terms: true, is_guest: false }) as User

const embedded = { type: 'wallet', chain_type: 'ethereum', wallet_client_type: 'privy', address: '0xEmbedded' }

describe('toIdentity', () => {
  it('takes the email and the wallet Privy made', () => {
    const external = { type: 'wallet', chain_type: 'ethereum', wallet_client_type: 'metamask', address: '0xExternal' }
    const solana = { type: 'wallet', chain_type: 'solana', wallet_client_type: 'privy', address: 'So1ana' }
    const email = { type: 'email', address: 'Nia@Example.com' }

    expect(toIdentity(user([external, solana, email, embedded]))).toEqual({
      subject: 'did:privy:abc',
      email: 'nia@example.com',
      walletAddress: '0xEmbedded'
    })
  })

  it('leaves out what the user does not have', () => {
    expect(toIdentity(user([{ type: 'passkey' }]))).toEqual({
      subject: 'did:privy:abc',
      email: null,
      walletAddress: null
    })
  })
})

describe('PrivyVerifier', () => {
  it('says so when the Privy keys are missing', async () => {
    await expect(new PrivyVerifier('', '').verifyToken('x')).rejects.toThrow('PRIVY_APP_ID')
  })

  it('treats a token Privy did not sign as invalid', async () => {
    // A made-up verification key means nothing is fetched from Privy.
    expect(await new PrivyVerifier('app-id', 'app-secret').verifyToken('not.a.jwt')).toBeNull()
  })
})
