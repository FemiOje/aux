import type { IdentityRepository } from './repository.js'

export function createIdentityService(repository: IdentityRepository) {
  return {
    async getHandles(userIds: number[]): Promise<Map<number, string>> {
      const rows = await repository.findHandlesByIds([...new Set(userIds)])
      return new Map(rows.map((r) => [r.id, r.handle]))
    }
  }
}

export type IdentityService = ReturnType<typeof createIdentityService>
