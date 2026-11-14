import { z } from 'zod';
export const patchMaintenanceSchema = z.object({
  enabled: z.boolean(),
  startAt: z.string().datetime({ offset: true }).nullable().optional(),
  endAt: z.string().datetime({ offset: true }).nullable().optional(),
  bannerAr: z.string().min(1).max(500),
  bannerEn: z.string().min(1).max(500),
});
export type PatchMaintenanceDto = z.infer<typeof patchMaintenanceSchema>;
