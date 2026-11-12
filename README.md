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

## 2. Sync progress through GitHub (leaderboard on every device)
Progress is saved as `state.json` on a separate **`data`** branch of this repo (created automatically on the first save, so it never redeploys the site). Anyone opening the site sees the live leaderboard (refreshes every 20 s); saving ticks needs a token.

**Once per person/device:**
1. GitHub → Settings → Developer settings → **Fine-grained personal access tokens** → *Generate*. Repository access: **only** `House-keeping-Schedule-`. Permission: **Contents → Read and write**. Pick a long expiry.
   (Paco and Hrithik need to be **collaborators** on the repo, or use *your* token on their phones.)
2. Open the site → pick your name → **Rules → Account → paste token → Save & sync**.

The token stays in that browser only (never in the repo). Edits are queued if you're offline and merged on top of others' changes, so nobody's ticks overwrite each other. The repo must be **public** for read-only viewers; the token is what limits writes.

**Remembered player:** your name is stored in a 1-year cookie, so the next visit on that device skips the "who are you" screen (*Switch player* clears it).

## 3. Apple Calendar + notifications
Open the **Calendar** tab on each phone and tap **Subscribe** for your own feed (plus the whole-house feed if you like). Each turn has an alert (morning at 07:45, evening 21:30 & 22:00, weekly cleaning Sat 17:00 / Sun 17:00 / 19:00).
Calendar feeds live in `calendar/*.ics`; regenerate with `npm run calendar` after changing the rotation or times in `js/schedule.js`.

**Notes**
- A static subscription can't know about swaps made in the app — use *Download my current schedule* in the Calendar tab for a snapshot that includes them.
- Web apps can't push while fully closed (iOS limitation without a server), so the calendar alerts are the reliable ping. Add the site to your Home Screen to also get in-app reminders.
- Tweak points, deadlines, the penalty start date and names in `js/schedule.js`.
- The token is a write key to this repo's contents — keep it to the three of you; revoke it in GitHub settings anytime.
- Honor system: the app only lets you tick your own duties, but there's no password.
