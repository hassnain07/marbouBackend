import { z } from 'zod';

export const patchFlagSchema = z.object({
  enabled: z.boolean().optional(),
  config: z.unknown().optional(),
  countryOverrides: z.record(z.string(), z.object({ enabled: z.boolean() })).optional(),
});
export type PatchFlagDto = z.infer<typeof patchFlagSchema>;
