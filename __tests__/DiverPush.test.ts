import { DiverPush, DiverPushError, parseCampaignTap } from '../src';

// React Native is a peer the package is tested without; `Platform.OS` is
// all it reads, and a phone's answer is what the default-platform test wants.
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }), { virtual: true });

/** Answers `status` with `body` and keeps every request it saw. */
class Recording {
  readonly requests: { url: string; init: RequestInit }[] = [];

  constructor(
    private status = 204,
    private body = '',
  ) {}

  readonly fetch: typeof fetch = async (input, init) => {
    this.requests.push({ url: String(input), init: init ?? {} });
    // A 204 may carry no body, not even an empty one; the constructor checks.
    return new Response(this.status === 204 ? null : this.body, { status: this.status });
  };

  get only() {
    expect(this.requests).toHaveLength(1);
    return this.requests[0]!;
  }

  get sentJson(): unknown {
    return JSON.parse(String(this.only.init.body));
  }

  header(name: string): string | undefined {
    return (this.only.init.headers as Record<string, string>)[name];
  }
}

const pushWith = (server: Recording, appKey = 'pk_test') =>
  new DiverPush({ appKey, orgId: 'org-1', appId: 'app-1', fetch: server.fetch });

describe('the key', () => {
  test('must be the public one; a CI secret does not ship in an app', () => {
    expect(() => pushWith(new Recording(), 'dk_secret')).toThrow(/CI key/);
    expect(() => pushWith(new Recording(), 'pk_fine')).not.toThrow();
  });

  test('is presented as a bearer token on every call', async () => {
    const server = new Recording();
    await pushWith(server).unregister('u1');
    expect(server.header('Authorization')).toBe('Bearer pk_test');
  });
});

describe('register', () => {
  test("posts one token entry to the app, in the server's shape", async () => {
    const server = new Recording();
    await pushWith(server).register({ externalId: 'u1', token: 'fcm-token', platform: 'android', tags: ['pro', 'da'] });
    const { url, init } = server.only;
    expect(init.method).toBe('POST');
    expect(url).toBe('https://api.usediver.com/organizations/org-1/apps/app-1/push/tokens');
    expect(server.header('Content-Type')).toBe('application/json');
    expect(server.sentJson).toEqual({
      tokens: [{ externalId: 'u1', token: 'fcm-token', platform: 'android', tags: ['pro', 'da'] }],
    });
  });

  test("names React Native's platform when none is given", async () => {
    const server = new Recording();
    await pushWith(server).register({ externalId: 'u1', token: 't' });
    expect((server.sentJson as { tokens: { platform: string }[] }).tokens[0]!.platform).toBe('ios');
  });

  test('honours another base URL, with or without a trailing slash', async () => {
    const server = new Recording();
    const push = new DiverPush({ appKey: 'pk_test', orgId: 'o', appId: 'a', baseUrl: 'https://api-dev.usediver.com/', fetch: server.fetch });
    await push.register({ externalId: 'u1', token: 't', platform: 'ios' });
    expect(server.only.url).toBe('https://api-dev.usediver.com/organizations/o/apps/a/push/tokens');
  });

  test("surfaces the server's refusal as an error with its sentence", async () => {
    const server = new Recording(403, 'An app key can only register push tokens and report opens.');
    await expect(pushWith(server).register({ externalId: 'u1', token: 't', platform: 'ios' })).rejects.toMatchObject({
      name: 'DiverPushError',
      statusCode: 403,
      message: expect.stringContaining('app key'),
    });
  });
});

describe('unregister', () => {
  test('deletes the token by external id, escaped', async () => {
    const server = new Recording();
    await pushWith(server).unregister('user one');
    expect(server.only.init.method).toBe('DELETE');
    expect(server.only.url).toMatch(/\/push\/tokens\/user%20one$/);
    expect(server.only.init.body).toBeUndefined();
  });

  test('is quiet about a token that was never registered', async () => {
    const server = new Recording(404, 'No such token');
    await expect(pushWith(server).unregister('ghost')).resolves.toBeUndefined();
  });
});

describe('reportOpen', () => {
  test('posts the external id to the campaign', async () => {
    const server = new Recording();
    await pushWith(server).reportOpen({ campaignId: 'c1', externalId: 'u1' });
    expect(server.only.url).toMatch(/\/push\/campaigns\/c1\/opens$/);
    expect(server.sentJson).toEqual({ externalId: 'u1' });
  });

  test('rejects for a campaign that was never sent', async () => {
    const server = new Recording(409, 'That campaign has not been sent');
    const failure = pushWith(server).reportOpen({ campaignId: 'c1', externalId: 'u1' });
    await expect(failure).rejects.toBeInstanceOf(DiverPushError);
    await expect(failure).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('parseCampaignTap', () => {
  test('reads the campaign and its link', () => {
    expect(parseCampaignTap({ campaignId: 'c1', uri: 'shop://sale' })).toEqual({ campaignId: 'c1', uri: 'shop://sale' });
  });

  test('is null for a notification that is not a campaign', () => {
    expect(parseCampaignTap({ uri: 'shop://sale' })).toBeNull();
    expect(parseCampaignTap({ campaignId: '' })).toBeNull();
    expect(parseCampaignTap({})).toBeNull();
    expect(parseCampaignTap(undefined)).toBeNull();
    expect(parseCampaignTap('nope')).toBeNull();
    // The link-delivery protocol Diver's own app speaks is not a campaign either.
    expect(parseCampaignTap({ version: '1', uri: 'diver://x' })).toBeNull();
  });

  test('keeps the campaign when the link is missing or unreadable', () => {
    expect(parseCampaignTap({ campaignId: 'c1' })?.uri).toBeNull();
    expect(parseCampaignTap({ campaignId: 'c1', uri: '' })?.uri).toBeNull();
    expect(parseCampaignTap({ campaignId: 'c1', uri: 42 })?.uri).toBeNull();
  });
});

describe('handleTap', () => {
  test('reports the open and answers the link', async () => {
    const server = new Recording();
    const uri = await pushWith(server).handleTap({ campaignId: 'c1', uri: 'shop://sale' }, { externalId: 'u1' });
    expect(uri).toBe('shop://sale');
    expect(server.only.url).toMatch(/\/campaigns\/c1\/opens$/);
  });

  test("leaves another sender's notification alone", async () => {
    const server = new Recording();
    expect(await pushWith(server).handleTap({ foo: 'bar' }, { externalId: 'u1' })).toBeNull();
    expect(server.requests).toHaveLength(0);
  });

  test('still answers the link when the report fails, and says so', async () => {
    const server = new Recording(500, 'boom');
    let seen: unknown;
    const uri = await pushWith(server).handleTap(
      { campaignId: 'c1', uri: 'shop://sale' },
      { externalId: 'u1', onError: (e) => (seen = e) },
    );
    expect(uri).toBe('shop://sale');
    expect(seen).toBeInstanceOf(DiverPushError);
  });

  test('answers null for a campaign that just opens the app', async () => {
    const server = new Recording();
    expect(await pushWith(server).handleTap({ campaignId: 'c1' }, { externalId: 'u1' })).toBeNull();
    expect(server.requests).toHaveLength(1);
  });
});
