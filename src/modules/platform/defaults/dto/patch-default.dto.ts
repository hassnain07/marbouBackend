import { z } from 'zod';
export const patchDefaultSchema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
});
export type PatchDefaultDto = z.infer<typeof patchDefaultSchema>;
