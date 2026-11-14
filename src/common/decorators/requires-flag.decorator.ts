import { SetMetadata } from '@nestjs/common';

export const REQUIRES_FLAG_KEY = 'requiresFlag';
/**
 * @RequiresFlag('payments.bankak_user_flow') — when the flag is OFF the
 * FlagGuard responds with 404 FEATURE_DISABLED (architecture §5.7).
 */
export const RequiresFlag = (flagKey: string) => SetMetadata(REQUIRES_FLAG_KEY, flagKey);
