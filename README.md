# 🏠 House Quest

A roommate chore game for Paco · Pit · Hrithik, built from the *House System* PDFs (10–23 Nov 2026 trial).

- **House Captain rota** (morning + evening resets), **weekly cleaning boss** (rotates every week), **laundry priority** — all computed from the rules, matching the fridge calendar.
- **Points & leaderboard**: on-time duties earn points, missed ones cost points + a strike, 3 strikes in 30 days triggers the household review. Levels, streaks, badges, crown for the leader.
- **Swaps** that follow your rule (must be *accepted* before the deadline) and emergency excuses.
- **Pixel heroes** of the three of you on the dashboard.
- **Apple Calendar**: subscribe once, every turn shows up with an alert on your phone.

## Run locally
```bash
npm run serve        # → http://localhost:8080   (or: python3 -m http.server 8080)
```
Time-travel for testing: `http://localhost:8080/?now=2026-11-14T09:00`

## 1. Host on GitHub Pages
Push this folder to the repo, then **Settings → Pages → Deploy from branch → `main` / root**.
The site appears at `https://pitsieben.github.io/House-keeping-Schedule-/`.

## 2. Share progress between your three phones (Firebase, free)
GitHub Pages is static, so a tiny free database keeps everyone's ticks in sync. Without it the app still works, but each phone only sees its own data.

1. https://console.firebase.google.com → **Add project** → **Build → Firestore Database → Create** (production mode).
2. **Project settings → Your apps → Web (`</>`)** → copy the config into [`js/firebase-config.js`](js/firebase-config.js) as `window.FIREBASE_CONFIG = {...}`.
3. **Firestore → Rules**, publish:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{db}/documents {
       match /houses/{code} {
         allow get, create, update: if true;   // no "list" → you must know the house code
         allow delete: if false;
       }
     }
   }
   ```
4. Open the site, tap your name, and enter a **house code** (e.g. `latin-lovers-7f3k`). Everyone enters the same code. Treat it like a password — it is not stored in the repo.

## 3. Apple Calendar + notifications
Open the **Calendar** tab on each phone and tap **Subscribe** for your own feed (plus the whole-house feed if you like). Each turn has an alert (morning at 07:45, evening 21:30 & 22:00, weekly cleaning Sat 17:00 / Sun 17:00 / 19:00).
Calendar feeds live in `calendar/*.ics`; regenerate with `npm run calendar` after changing the rotation or times in `js/schedule.js`.

**Notes**
- A static subscription can't know about swaps made in the app — use *Download my current schedule* in the Calendar tab for a snapshot that includes them.
- Web apps can't push while fully closed (iOS limitation without a server), so the calendar alerts are the reliable ping. Add the site to your Home Screen to also get in-app reminders.
- Tweak points, deadlines, the penalty start date and names in `js/schedule.js`.
- Honor system: the app only lets you tick your own duties, but there's no password.
