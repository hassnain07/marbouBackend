import { z } from 'zod';
const semver = z.string().regex(/^\d+\.\d+\.\d+$/, 'Must be semver x.y.z');
const platformSchema = z.object({ minimum: semver, latest: semver });
export const patchAppVersionsSchema = z.object({
  ios: platformSchema,
  android: platformSchema,
});
export type PatchAppVersionsDto = z.infer<typeof patchAppVersionsSchema>;
