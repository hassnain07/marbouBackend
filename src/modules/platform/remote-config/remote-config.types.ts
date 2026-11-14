/** Shapes of the three RemoteConfig value blobs (§7.1). */

export interface AppVersionConfig {
  ios: { minimum: string; latest: string };
  android: { minimum: string; latest: string };
}

export interface MaintenanceConfig {
  enabled: boolean;
  /** ISO date-time string of when maintenance window starts, null if none scheduled. */
  startAt: string | null;
  /** ISO date-time string of when maintenance window ends, null if none scheduled. */
  endAt: string | null;
  bannerAr: string;
  bannerEn: string;
}

/** Per-category video override: key = categoryId, value = { enabled, maxDurationSeconds, maxSizeBytes }. */
export interface CategoryVideoOverride {
  enabled: boolean;
  maxDurationSeconds?: number;
  maxSizeMb?: number;
}

export interface MediaLimitsConfig {
  videoEnabled: boolean;
  /** Maximum video duration in seconds. Default 30. */
  maxVideoDurationSeconds: number;
  /** Maximum video file size in MB. Default 15. */
  maxVideoSizeMb: number;
  /** Maximum photos per listing. Default 10 (Appendix C). */
  maxPhotosPerListing: number;
  /** Per-category overrides: { "<categoryId>": { enabled, maxDurationSeconds, maxSizeMb } } */
  categoryOverrides: Record<string, CategoryVideoOverride>;
}

/** Keys stored in the RemoteConfig table. */
export const RemoteConfigKey = {
  APP_VERSIONS: 'appVersions',
  MAINTENANCE: 'maintenance',
  MEDIA_LIMITS: 'mediaLimits',
} as const;
export type RemoteConfigKey = (typeof RemoteConfigKey)[keyof typeof RemoteConfigKey];

/** Default values derived directly from Appendix C and PRD §7.1. */
export const DEFAULT_APP_VERSIONS: AppVersionConfig = {
  ios: { minimum: '1.0.0', latest: '1.0.0' },
  android: { minimum: '1.0.0', latest: '1.0.0' },
};

export const DEFAULT_MAINTENANCE: MaintenanceConfig = {
  enabled: false,
  startAt: null,
  endAt: null,
  bannerAr: 'الموقع تحت الصيانة، يرجى المحاولة لاحقاً',
  bannerEn: 'The service is under maintenance, please try again later',
};

export const DEFAULT_MEDIA_LIMITS: MediaLimitsConfig = {
  videoEnabled: true,
  maxVideoDurationSeconds: 30, // Appendix C
  maxVideoSizeMb: 15, // Appendix C
  maxPhotosPerListing: 10, // Appendix C
  categoryOverrides: {},
};
