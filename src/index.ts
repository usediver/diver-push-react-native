/**
 * Diver Push for React Native: register this install's push token and report
 * the notifications its user taps, so campaigns sent from push.usediver.com
 * reach them and can be measured.
 *
 * This package does not touch Firebase or Expo's notifications. Your app
 * keeps its own setup for permissions, tokens and delivery; this is the few
 * calls that tell Diver about them. See the README for the wiring.
 */
export { DiverPush, DEFAULT_BASE_URL } from './DiverPush';
export type { DiverPushOptions, RegisterOptions, HandleTapOptions } from './DiverPush';
export { parseCampaignTap } from './campaignTap';
export type { DiverCampaignTap } from './campaignTap';
export { DiverPushError } from './errors';
export { currentPlatform } from './platform';
export type { DiverPushPlatform } from './platform';
