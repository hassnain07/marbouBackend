import { z } from 'zod';

export const loginSchema = z.object({
  // A7: normalize email at the schema boundary (trim + lowercase)
  email: z.string().email().transform((v) => v.trim().toLowerCase()),
  password: z.string().min(1),
});
export type LoginDto = z.infer<typeof loginSchema>;

export const verifyTotpSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'code must be 6 digits'),
});
export type VerifyTotpDto = z.infer<typeof verifyTotpSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshDto = z.infer<typeof refreshSchema>;
