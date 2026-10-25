/** The platforms Diver Push targets a campaign at; the wire names. */
export type DiverPushPlatform = 'ios' | 'android' | 'web' | 'macos' | 'windows';

const PLATFORMS: readonly DiverPushPlatform[] = ['ios', 'android', 'web', 'macos', 'windows'];

/**
 * The platform this code is running on, read from React Native's
 * `Platform.OS`, whose names are Diver's names. Resolved lazily so the
 * package can be imported — and tested — where React Native is not
 * installed; pass a platform to `register` from such a place.
 */
export function currentPlatform(): DiverPushPlatform {
  let os: unknown;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    os = (require('react-native') as { Platform: { OS: unknown } }).Platform.OS;
  } catch {
    throw new Error('Diver Push could not read the platform from react-native; pass one to register() explicitly.');
  }
  if (typeof os === 'string' && (PLATFORMS as readonly string[]).includes(os)) {
    return os as DiverPushPlatform;
  }
  throw new Error(`Diver Push has no platform name for ${String(os)}; pass one to register() explicitly.`);
}
