import { z } from "zod";

export const createDropSchema = z.object({
  link: z.url(),
  note: z.string().min(1).max(280),
});
export type CreateDrop = z.infer<typeof createDropSchema>;

export type ApiError = { error: { code: string; message: string } };
