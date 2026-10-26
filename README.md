# Enterprise Inventory Count & Approval Manager

Static web app (GitHub Pages) for entity-level physical inventory counts with a
manager approval step. Uses Firebase Realtime Database for live sync across
devices, or falls back to the browser's Local Storage when no Firebase config is present.

## Firebase configuration (GitHub Secrets)

The Firebase settings are **not** stored in the repo. On every deploy, the
Pages workflow (`.github/workflows/static.yml`) writes `js/firebase-config.js`
from repository secrets.

1. In GitHub, open the repo → **Settings → Secrets and variables → Actions → New repository secret**.
2. Add these secrets (values come from Firebase console → Project settings → Your apps → Web app config):

| Secret name | Firebase field | Required |
|---|---|---|
| `FIREBASE_API_KEY` | `apiKey` | Yes |
| `FIREBASE_DATABASE_URL` | `databaseURL` | Yes |
| `FIREBASE_PROJECT_ID` | `projectId` | Yes |
| `FIREBASE_APP_ID` | `appId` | Yes |
| `FIREBASE_AUTH_DOMAIN` | `authDomain` | Optional |
| `FIREBASE_STORAGE_BUCKET` | `storageBucket` | Optional |
| `FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` | Optional |
| `FIREBASE_MEASUREMENT_ID` | `measurementId` | Optional |

3. Make sure **Settings → Pages → Source** is set to **GitHub Actions**.
4. Push to `main` (or run the workflow manually from the Actions tab). The deploy
   fails with a clear error if a required secret is missing, so you never
   accidentally ship a Local-Storage-only version.

### Local testing

Copy `js/firebase-config.example.js` to `js/firebase-config.js` and fill in the
values. That file is in `.gitignore` — don't commit it. Without it, the app runs in
Local Storage mode.

## Important: what secrets do and don't protect

A Firebase **web** config always ends up in the browser — anyone visiting the
site can see it in developer tools. Moving it to secrets keeps it out of the
source code and repo, but it is not what protects your data. Your data is
protected by:

- **Firebase Realtime Database Security Rules** (Firebase console → Realtime Database → Rules).
- **API key restrictions** (Google Cloud console → APIs & Services → Credentials →
  restrict the browser key to HTTP referrer `https://<your-user>.github.io/*`).

The old key was previously committed to this repo, so it remains in git history.
Adding the referrer restriction above covers that; rotating the key is optional.

## Passwords

Entity and admin passwords live in `js/config.js`. Because they are checked in the
browser, anyone who views the page source can read them, and anyone can call app
functions from the console. They work as a convenience lock, not real security.
The long-term fix is Firebase Authentication plus database rules that check the
signed-in user.
