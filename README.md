# @usediver/push

Register your app's push tokens and report notification opens with
[Diver Push](https://push.usediver.com), so the campaigns you send from the
console reach your users and you can see who opened them.

The package does not touch Firebase or Expo's notifications. Your app keeps
its own setup — permissions, the token, delivery — and this is the few calls
that tell Diver about it. Pure TypeScript over `fetch`, no native module, so
it works in bare React Native and in Expo managed projects alike.

## Setup

1. In the push console, open your app's **Device tokens** card and **Create
   app key**. It starts with `pk_` and is safe to ship inside your build:
   it can register tokens and report opens for this one app, and nothing
   else. (Never ship a `dk_` CI key; the constructor refuses one.)
2. Add the package and construct a client once, with the organization and
   app ids from the console's URL:

```ts
import { DiverPush } from '@usediver/push';

export const diverPush = new DiverPush({
  appKey: 'pk_…',
  orgId: '<organization id>',
  appId: '<app id>',
  // baseUrl: 'https://api-dev.usediver.com', // staging
});
```

## Register the token

Once you have an FCM token, register it under your own id for the user or
install — the `externalId` — and the tags campaigns target. Register again
whenever the token is refreshed; the same `externalId` replaces its entry.

```ts
import messaging from '@react-native-firebase/messaging';

async function registerWithDiver(userId: string) {
  const token = await messaging().getToken();
  await diverPush.register({ externalId: userId, token, tags: ['pro'] });
}

messaging().onTokenRefresh((token) => {
  diverPush.register({ externalId: currentUserId, token, tags: ['pro'] });
});
```

With Expo, the token is `(await Notifications.getDevicePushTokenAsync()).data`
— the device token, not the Expo push token, since Diver sends through FCM
directly.

On sign-out, forget it, so the next campaign does not land on a device
nobody is signed in on:

```ts
await diverPush.unregister(userId);
```

## Report the tap

Hand both tap paths to `handleTap`: the one for a tap that brought a running
app forward, and the one for a tap that launched it. It answers `null` for
anything that is not a Diver campaign, so your other notifications fall
through untouched; otherwise it reports the open and answers the link the
campaign carried, for you to open.

```ts
import { Linking } from 'react-native';

async function onTap(data: unknown) {
  const uri = await diverPush.handleTap(data, { externalId: currentUserId });
  if (uri) await Linking.openURL(uri);
}

messaging().onNotificationOpenedApp((message) => onTap(message.data));
messaging().getInitialNotification().then((message) => message && onTap(message.data));
```

With Expo, the data is `response.notification.request.content.data` from
`addNotificationResponseReceivedListener` and `getLastNotificationResponseAsync`.

Reporting is best effort: the user is waiting on the link, so a report that
fails (offline, mostly) is handed to `onError` and the link is still
answered. One open is counted per recipient per campaign, so a second tap
or a retry changes nothing.

## What is sent

Three routes on the Diver API, each with `Authorization: Bearer pk_…`:

| Call | Route |
| --- | --- |
| `register` | `POST /organizations/{org}/apps/{app}/push/tokens` with one `{externalId, token, platform, tags}` entry |
| `unregister` | `DELETE …/push/tokens/{externalId}` |
| `reportOpen` / `handleTap` | `POST …/push/campaigns/{campaignId}/opens` with `{externalId}` |

`platform` is read from React Native's `Platform.OS` (`ios`, `android`,
`web`, `macos`, `windows`); pass one to `register` from anywhere else. A
refusal rejects with a `DiverPushError` carrying the server's own sentence.
