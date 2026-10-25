import { parseCampaignTap } from './campaignTap';
import { DiverPushError } from './errors';
import { currentPlatform, type DiverPushPlatform } from './platform';

/** The deployed Diver API. Point `baseUrl` at `https://api-dev.usediver.com` for the staging stack. */
export const DEFAULT_BASE_URL = 'https://api.usediver.com';

export interface DiverPushOptions {
  /** The app key (`pk_…`) minted in the push console. Never a `dk_` CI key. */
  appKey: string;
  orgId: string;
  appId: string;
  baseUrl?: string;
  /** Stands in for the global `fetch`; tests use it. */
  fetch?: typeof fetch;
}

export interface RegisterOptions {
  /** Your own id for the user or the install; what opens are reported with. */
  externalId: string;
  /** The FCM token. */
  token: string;
  /** Defaults to the platform React Native reports. */
  platform?: DiverPushPlatform;
  /** What campaigns target. A tag cannot contain a comma. */
  tags?: readonly string[];
}

export interface HandleTapOptions {
  externalId: string;
  /** Where a failed report goes; the link is answered regardless. */
  onError?: (error: unknown) => void;
}

/**
 * The Diver Push client for one app.
 *
 * Three calls, over the app's public key: `register` a token, `unregister`
 * it, and `reportOpen` a tap. `handleTap` wraps the last one for the
 * notification-tap handlers your messaging library gives you.
 *
 * The key is public on purpose — it ships inside your build — and can do
 * nothing but these three things for this one app. Keep your `dk_` CI keys
 * out of the app; the constructor refuses one.
 */
export class DiverPush {
  readonly appKey: string;
  readonly orgId: string;
  readonly appId: string;
  readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: DiverPushOptions) {
    if (!options.appKey.startsWith('pk_')) {
      throw new Error(
        'Diver Push takes the app key (pk_…) minted in the push console. ' +
          'A CI key (dk_…) is a server secret and must not ship in an app.',
      );
    }
    this.appKey = options.appKey;
    this.orgId = options.orgId;
    this.appId = options.appId;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    // Bound now: a bare `fetch` reference loses its `this` in some runtimes.
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
  }

  /**
   * Registers this install's push token under `externalId`.
   *
   * Call it once you hold a token, and again every time FCM refreshes it:
   * the same `externalId` replaces its entry, so re-registering is always
   * safe.
   */
  async register({ externalId, token, platform, tags = [] }: RegisterOptions): Promise<void> {
    await this.send('POST', '/tokens', {
      tokens: [{ externalId, token, platform: platform ?? currentPlatform(), tags }],
    });
  }

  /**
   * Forgets `externalId`'s token, so the next campaign does not reach a
   * device nobody is signed in on. Call it on sign-out. Forgetting a token
   * that was never registered is not an error.
   */
  async unregister(externalId: string): Promise<void> {
    await this.send('DELETE', `/tokens/${encodeURIComponent(externalId)}`, undefined, [404]);
  }

  /**
   * Reports that `externalId` tapped the notification for `campaignId`.
   *
   * Counted once per recipient per campaign, so reporting twice — a second
   * tap, a retried call — changes nothing. Rejects with a 409
   * `DiverPushError` for a campaign that has not been sent, which only a
   * forged notification could produce.
   */
  async reportOpen({ campaignId, externalId }: { campaignId: string; externalId: string }): Promise<void> {
    await this.send('POST', `/campaigns/${encodeURIComponent(campaignId)}/opens`, { externalId });
  }

  /**
   * The tap handler, for `onNotificationOpenedApp`, `getInitialNotification`
   * and Expo's response listener: hand it the notification's data.
   *
   * Answers null when the notification is not a Diver campaign, so your
   * other notifications fall through untouched. Otherwise it reports the
   * open and answers the link the campaign carried, for you to open — or
   * null for a campaign that just opens the app.
   *
   * Reporting is best effort: the user is waiting on the link, so a report
   * that fails (offline, mostly) is handed to `onError` and the link is
   * still answered. Nothing rejects out of here.
   */
  async handleTap(data: unknown, { externalId, onError }: HandleTapOptions): Promise<string | null> {
    const tap = parseCampaignTap(data);
    if (tap === null) return null;
    try {
      await this.reportOpen({ campaignId: tap.campaignId, externalId });
    } catch (error) {
      onError?.(error);
    }
    return tap.uri;
  }

  private async send(method: 'POST' | 'DELETE', path: string, body?: unknown, quiet: number[] = []): Promise<void> {
    const url = `${this.baseUrl}/organizations/${encodeURIComponent(this.orgId)}/apps/${encodeURIComponent(this.appId)}/push${path}`;
    const response = await this.fetchImpl(url, {
      method,
      headers: { Authorization: `Bearer ${this.appKey}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (response.ok || quiet.includes(response.status)) return;
    const text = (await response.text()).trim();
    throw new DiverPushError(response.status, text.length > 0 ? text : response.statusText || 'Request failed');
  }
}
