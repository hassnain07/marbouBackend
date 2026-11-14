import { z } from 'zod';
export const patchMediaLimitsSchema = z.object({
  videoEnabled: z.boolean().optional(),
  maxVideoDurationSeconds: z.number().int().min(1).max(300).optional(),
  maxVideoSizeMb: z.number().int().min(1).max(500).optional(),
  maxPhotosPerListing: z.number().int().min(1).max(100).optional(),
  categoryOverrides: z
    .record(
      z.string(),
      z.object({
        enabled: z.boolean(),
        maxDurationSeconds: z.number().int().optional(),
        maxSizeMb: z.number().int().optional(),
      }),
    )
    .optional(),
});
export type PatchMediaLimitsDto = z.infer<typeof patchMediaLimitsSchema>;
