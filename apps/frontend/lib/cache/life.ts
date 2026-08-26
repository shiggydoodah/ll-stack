export interface CacheLifeProfile {
  readonly revalidate: number;
  readonly expire: number;
}

export const cacheLifeProfiles = {
  default: { revalidate: 60, expire: 300 },
  short: { revalidate: 30, expire: 60 },
  medium: { revalidate: 60, expire: 300 },
  long: { revalidate: 300, expire: 900 },
  veryLong: { revalidate: 900, expire: 3600 },
} satisfies Record<string, CacheLifeProfile>;
