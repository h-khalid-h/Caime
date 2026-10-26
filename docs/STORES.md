# Caime in the stores (R120)

Where Caime is listed and how it gets there: the App Store and Google Play (the Expo app), the Mac
App Store (the same iPhone app's iPad build, on Apple silicon), the Microsoft Store and Linux (the
desktop app, ROADMAP M19 K4), and the web app installed from any browser. What's built is in the
repository. What needs the owner's accounts is marked ⛔ with the step that clears it. Nothing here
is claimed done until a store lists it (convention 12).

## What's in the repository

- **The listings**, the same words in both stores and in the four interface languages:
  - the App Store's in `apps/app/store.config.json` (EAS Metadata: name, subtitle, description,
    keywords, the support, marketing and privacy addresses, the categories);
  - Google Play's in `apps/app/store/play/<locale>/` (`title.txt`, `short_description.txt`,
    `full_description.txt`, the layout Play's upload tools read).

  `src/lib/storeListing.test.ts` holds them to each store's limits and to one another, with no
  price, no way to buy and no other app's name (App Store 2.3.7).
- **Nothing is sold in a phone app** (`apps/app/src/lib/stores.ts`, `sellsHere`). A phone app is
  the free companion of a paid web service (App Store 3.1.3(f); Google Play's consumption-only
  apps):
  - the plan screens say which plan someone is on and what it includes, with no price, Get
    button, link to the plans or billing portal;
  - an organization's own checkout for its goods and services (R65) is a real-world service
    (3.1.3(e)) and stays;
  - Pay cards are records between people (R62) and stay.
- **The iOS privacy manifest** (`ios.privacyManifests` in `apps/app/app.json`): no tracking, and
  the required reasons for the APIs React Native and Expo read:
  - user defaults `CA92.1`;
  - file timestamps `C617.1`;
  - boot time `35F9.1`;
  - disk space `E174.1`.

  If App Store Connect's upload names another (`ITMS-91053`), add it here with its reason.
- **The permission prompts** in `apps/app/app.json`: camera, microphone, photos, location when
  shared, contacts. Each says what it's for and that nothing more is taken. Android's write
  access to contacts is blocked.
- **Account deletion in the app**: Settings · Security · Delete account (App Store 5.1.1(v),
  Google Play's account deletion policy). The web page for deleting an account without the app
  is the same screen at `https://cai.me/settings/security`, after sign-in.
- **Sign in with Apple** isn't required: Caime offers no third-party sign-in (4.8), only an
  address and password, and passkeys.
- **The build and submit workflow**, `.github/workflows/stores.yml`:
  - run by hand (Actions · Stores) or by pushing a tag `app-v*`;
  - EAS builds on Expo's machines with the `production` profile (`apps/app/eas.json`, pointed at
    `https://cai.me`), submits with the credentials kept in the Expo project, then pushes the App
    Store listing (`eas metadata:push`);
  - without `EXPO_TOKEN` and `EXPO_PROJECT_ID` it warns and builds nothing.
- **Where Caime is listed** reaches the site and the web app from four settings on the service,
  each set once its listing is live:
  - `APPLE_APP_ID`;
  - `PLAY_LISTED=true`;
  - `MICROSOFT_STORE_ID`;
  - `DESKTOP_RELEASES_URL`.

  `/download` then leads with the store on each device, and the manifest names the phone apps
  (`related_applications`). Until then they show the browser's own install.

## ⛔ What the owner does, once, in this order

1. **Apple Developer Program** for DATA C OÜ, which needs a D-U-N-S number. Then, in App Store
   Connect:
   - make an app with the bundle id `me.cai.app` and the name Caime;
   - set `APPLE_TEAM_ID` on the service in EasyPanel, so links open the app and passkeys work in
     it (R35);
   - under Pricing and Availability, keep "Make this app available on Mac" on (the iPad build on
     Apple silicon is the Mac App Store's Caime);
   - make an App Store Connect API key (App Manager) for EAS.
2. **Google Play Console** for DATA C OÜ (an organization account, D-U-N-S):
   - make an app with the package `me.cai.app`;
   - Play takes the first build by hand: run the workflow with "Submit" off, download the `.aab`
     from EAS, and upload it to Internal testing;
   - then make a service account with release rights for EAS;
   - set `ANDROID_CERT_SHA256` (Play's app signing certificate, under App integrity) on the
     service.
3. **Expo**:
   - make the project `caime`; its id is `EXPO_PROJECT_ID`, a GitHub repository variable and the
     same one `caime-go` has;
   - make an access token, `EXPO_TOKEN`, as a GitHub repository secret;
   - `eas credentials` in `apps/app` stores the App Store Connect key and Play's service account
     once.
4. **A review account**, made by the owner on Caime (never by a session: no sign-ups on
   production). Its address and password go in App Store Connect's App Review Information and
   Play's App access. Review notes:
   - "Caime is messaging; sign in with the account above. Plans are bought on the web, never in
     the app (3.1.3(f)).
   - Account deletion: Settings, Security, Delete account.
   - Private conversations use standard end-to-end encryption (X25519, AES-GCM)."
5. **Export compliance** (counsel ⛔). Caime's private conversations use standard encryption in
   a mass-market product. Counsel answers App Store Connect's encryption questions, sets
   `ITSAppUsesNonExemptEncryption` from that answer, and says whether France needs the ANSSI
   declaration. Until then each build asks it in App Store Connect.
6. **Run Actions · Stores.**
7. When each listing is live, set its setting on the service (above) and redeploy.

## The answers the stores ask for

From what the code keeps (`docs/SECURITY.md`, the privacy page, `lib/processors.ts`). These are
entered in App Store Connect (App Privacy) and Play Console (Data safety) by hand. When the code
changes what it keeps, they change here first.

**Collected, linked to the person, never used for tracking or advertising, never sold:**

- **Contact info:**
  - name;
  - email address;
  - phone number (only when someone adds one, R91).

  Used for the app's functioning and account management.
- **User content:**
  - messages and their attachments: photos, videos, audio (voice notes, call recordings when
    everyone said yes), files;
  - calendar events (meetings and appointments made in Caime);
  - customer support (reports).

  Used for the app's functioning. Private conversations' content is end-to-end encrypted and
  never readable by Caime.
- **Location:** precise, only when someone shares it in a conversation (a Location card or live
  location), never in the background. Used for the app's functioning.
- **Identifiers:** the user id; the device's push token. Used for the app's functioning.
- **Usage data:** product interaction (when someone was last active, what Cai was asked to do and
  what it cost). Used for the app's functioning and the operator's analytics, counted in
  aggregate.
- **Other data:**
  - date of birth (the under-18 rules, R29);
  - gender, only if the person says it (R81).
- **Contacts:** read on the device. Only addresses and numbers are sent, to find who's already on
  Caime, and nothing is kept (R89). Apple: not collected, since nothing is stored past the
  answer. Play: collected, processed ephemerally.
- **Not collected:** health, financial info (card payments happen on Stripe's page, on the web),
  browsing history, search history beyond the person's own searches inside Caime, diagnostics or
  crash data, advertising data.

**Play's Data safety, also:**

- encrypted in transit: yes;
- people can ask for deletion: yes, in the app, and their data is erased as the privacy page says;
- data shared with third parties: no (the processors listed on the privacy page act for Caime
  and are service providers, not sharing).

**Content rating** (IARC on Play, Apple's questionnaire):

- people communicate with each other and share their location when they choose;
- no violence, sexual content, gambling, drugs or profanity provided by Caime;
- reporting and blocking in every conversation, and under-18 protections (R29).

Caime's own minimum age is 13, 18 where the law asks it (Egypt, Saudi Arabia), so the rating
the stores give must not fall below it. ⛔ The owner and counsel pick Apple's band (13+ or 16+
under Apple's 2025 ratings) and confirm the IARC answers.

## The desktop and the browser

- **The web app installed from a browser** is the same build (R120, ROADMAP M19 K2). It has:
  - a manifest by language (`/manifest.webmanifest`);
  - one window;
  - the count of what needs you on its icon;
  - shortcuts;
  - a share target (`/share`);
  - the install offer in the iPhone card's place on Attention.
- **The desktop app** (K4) is the web app in a thin, sandboxed Electron shell over `PUBLIC_URL`.
  Linux files go on GitHub's releases; the Microsoft Store's package is signed by the Store.
  ⛔ It needs:
  - a Partner Center account;
  - Apple's Developer ID and notarisation for a Mac download;
  - a Windows signing certificate for a download outside the Store.

  No unsigned Mac or Windows file is ever offered.
