import { AppError } from '../../errors.js'

// Cursors are opaque to clients so the feed's ordering can change without breaking them.
export const encodeCursor = (lastId: number) => Buffer.from(String(lastId)).toString('base64url')

export function decodeCursor(cursor: string): number {
  const id = Number(Buffer.from(cursor, 'base64url').toString())
  // Buffer skips characters that aren't base64, so only accept what we would have issued.
  if (!Number.isSafeInteger(id) || id < 0 || encodeCursor(id) !== cursor) {
    throw new AppError(400, 'INVALID_CURSOR', 'That cursor is not valid')
  }
  return id
}
