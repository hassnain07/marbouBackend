import { SetMetadata } from '@nestjs/common';

/** Marks a route (or controller) as public — no JWT required (AUTH-18). Applied
 *  as `@Public()`. The global auth guard (added in Phase 3) checks this metadata. */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
