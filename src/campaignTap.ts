/**
 * What a Diver campaign notification carries in its data: which campaign it
 * was, and the link it opens, if any.
 */
export interface DiverCampaignTap {
  campaignId: string;
  /**
   * The app link the campaign was composed with — one of the app's own
   * deeplinks — or null for a notification that just opens the app.
   */
  uri: string | null;
}

/**
 * Reads a notification's data, as `remoteMessage.data` (React Native
 * Firebase) or `notification.request.content.data` (Expo) hand it over.
 * Null when this is not a Diver campaign: a message from somewhere else is
 * somebody else's to handle.
 */
export function parseCampaignTap(data: unknown): DiverCampaignTap | null {
  if (typeof data !== 'object' || data === null) return null;
  const { campaignId, uri } = data as Record<string, unknown>;
  if (typeof campaignId !== 'string' || campaignId.length === 0) return null;
  return { campaignId, uri: typeof uri === 'string' && uri.length > 0 ? uri : null };
}
