import { z } from "zod";

export const createDropSchema = z.object({
  link: z.url(),
  note: z.string().trim().min(1).max(280),
});
export type CreateDrop = z.infer<typeof createDropSchema>;

export const providerTrackSchema = z.object({
  provider: z.string(),
  providerTrackId: z.string(),
});
export type ProviderTrack = z.infer<typeof providerTrackSchema>;

export const recordingSchema = z.object({
  id: z.number().int(),
  title: z.string(),
  artist: z.string(),
  durationMs: z.number().int().nullable(),
  tracks: z.array(providerTrackSchema),
});
export type Recording = z.infer<typeof recordingSchema>;

export const dropSchema = z.object({
  id: z.number().int(),
  curator: z.object({ handle: z.string() }),
  recording: recordingSchema,
  note: z.string(),
  saveCount: z.number().int(),
  createdAt: z.iso.datetime(),
});
export type Drop = z.infer<typeof dropSchema>;

export const FEED_PAGE_SIZE = 20;
export const FEED_MAX_PAGE_SIZE = 50;

export const feedQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(FEED_MAX_PAGE_SIZE).default(FEED_PAGE_SIZE),
});
export type FeedQuery = z.infer<typeof feedQuerySchema>;

export const feedResponseSchema = z.object({
  drops: z.array(dropSchema),
  nextCursor: z.string().nullable(),
});
export type FeedResponse = z.infer<typeof feedResponseSchema>;

export const dropParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const resolveRequestSchema = z.object({
  link: z.url(),
});
export type ResolveRequest = z.infer<typeof resolveRequestSchema>;

// `recording` is null when we couldn't be sure which song the link is; `matches` are the closest we have.
export const resolveResponseSchema = z.object({
  recording: recordingSchema.nullable(),
  matches: z.array(recordingSchema),
});
export type ResolveResponse = z.infer<typeof resolveResponseSchema>;

// `token` is the Privy identity token the browser got at sign-in.
export const sessionRequestSchema = z.object({
  token: z.string().min(1),
});
export type SessionRequest = z.infer<typeof sessionRequestSchema>;

export const meSchema = z.object({
  id: z.number().int(),
  handle: z.string(),
  email: z.string(),
  walletAddress: z.string().nullable(),
  preferredProvider: z.string(),
  createdAt: z.iso.datetime(),
});
export type Me = z.infer<typeof meSchema>;

// `token` is our session token: send it back as `Authorization: Bearer <token>`.
export const sessionResponseSchema = z.object({
  token: z.string(),
  expiresAt: z.iso.datetime(),
  user: meSchema,
});
export type SessionResponse = z.infer<typeof sessionResponseSchema>;

export const apiErrorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
