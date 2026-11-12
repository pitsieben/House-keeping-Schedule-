# House Quest implementation log (compact)

Started 2026-11-12. Git history has the details; this file is the map.

## A. How to use this file
- Start of a session: read B, C, G (how it fits together, where to work, what is next); D–F only when the task touches that area.
- After each completed step, append ONE entry to section I (template there): date, what changed, checked, not verified.
- When section I grows past ~60 lines, compress the oldest entries into D (Done) / E / F and delete them from I.

## B. Architecture
- Static site on GitHub Pages, deployed from `main` (root). No build step; plain ES modules; Pages redeploys ~30–60 s after a merge.
- Shared game state = one file, `state.json`, on the orphan `data` branch (no code there). Shape: `completions`, `swaps`, `excused`, `fakes`, `flags`, `log`, `admin.pinHash`, `rooms[who].placed`, `outfits[who]`.
- Read: every phone polls the GitHub contents API every 20 s (ETag) and on reopen; works without a token for public repos.
- Write: needs a fine-grained token (Contents R/W, this repo). `store.patch` applies locally, queues in localStorage, and 0.5 s later re-reads the remote file, re-applies the queue, and PUTs with `sha`; retries on 409/422. Offline = queued.
- Token: per device in localStorage; shared via invite link `…/#t=<token>` (fragment, stripped on load) or the Paste button. iOS Home Screen apps have separate storage from Safari.
- Everything shown (points, levels, strikes, achievements, collectibles, dirt, altitude) is derived from `state.json` on each render; nothing derived is stored.
- `main` protected by ruleset (PR required, no bypass), so the token cannot change code.
- Auto-update: `sw.js` serves same-origin files network-first with revalidation (cache only offline); the app polls `commits/main` every 5 min and reloads 2 min after a change (not while typing or with unsynced ticks).
- Player identity: 1-year cookie `house-quest-me` (+ localStorage fallback). Heroes fixed per roommate: Hritik `s1`, Paco `s2`, Pit `s3`.

## C. Where to work
| Task | Files (key functions/types) | How to test |
|---|---|---|
| Rota, deadlines, points, strikes | `js/schedule.js` (`dutiesForDate`, `statusOf`, `computeScores`, `POINTS`, `CONFIG`) | `npm test`; `?now=` in the browser |
| Sync / token / data branch | `js/store.js` (`pull`, `flush`, `ensureBranch`, `patch`) | `npm test` (mocked GitHub: conflict, orphan branch, missing file) |
| Fake / steal / flags / admin | `js/schedule.js` (`fake` status), `js/app.js` (`dutyCard`, `adminView`, actions `afake`…`steal`) | `npm test`; headless as `pit` with PIN |
| Leaderboard scene (altitude scale) | `js/app.js` (`partyScene`, `LAYERS`, `clampPts`, ruler) | headless screenshot with seeded scores |
| Rooms, achievements, collectibles, dirt | `js/rooms.js` (`computeAchievements`, `ownedItems`, `placedItems`, `dirtLevel`, `drawRoom`, `ITEMS`), `js/app.js` (`roomsView`) | `npm test`; headless Rooms tab with seeded months |
| Heroes, outfits | `js/sprites.js` (`SPRITES`, `OUTFITS`, `ROLES`, `drawHero`, `spriteURL`), `js/app.js` (`HEROES`, `outfitOf`) | headless screenshot |
| Calendar feeds / ICS | `js/ics.js`, `scripts/build-calendar.mjs`, `calendar/*.ics` | `npm run calendar`, diff the feeds |
| Styling / background | `css/style.css`, `assets/livingroom.svg` | headless screenshot |
| PWA / caching / icons | `sw.js`, `manifest.webmanifest`, `index.html`, `icon*.png`, `apple-touch-icon.png` | headless (SW registers), real iPhone |
| Docs for roommates | `TUTORIAL.md`, `docs/tutorial/*.png` (`scripts/tutorial-shots.mjs`) | open on GitHub |

## D. Done (compressed)
- 2026-11-12 PR #1: GitHub sync via `data` branch (replaced the never-configured Firebase); remember player in a cookie; invite link.
- 2026-11-12 PR #2: fixed hero per roommate (no picker).
- 2026-11-12 PR #3: heaven/earth/hell leaderboard; Barcelona pixel living-room background; neutral dark theme; local data reset (keys → v2).
- 2026-11-12 PR #4: zooming altitude scale (log meters, ground → Moon, crust → magma), heroes shrink when zoomed out, minimal ruler (labels behind heroes); iPhone icons.
- 2026-11-12 PR #5: paste invite link/token inside the Home Screen app.
- 2026-11-12 PR #6: flags + PIN-locked admin tab (Pit); fake = 2× penalty + strike, 24 h steal window, "Up for grabs"; TUTORIAL.md with screenshots; orphan `data` branch creation; `data` branch cleaned to `state.json` only (normal commit, `state.json` unchanged).
- 2026-11-12 PR #7: duties ticked before their date (early weekly cleaning) score immediately.
- 2026-11-12 PR #8: auto-update (network-first SW + reload after deploy).

## E. Verified vs NOT verified
- Verified headless (mocked GitHub): sync merge on conflict, orphan branch, missing file; scoring incl. fake/steal and early ticks; admin flow; leaderboard zoom/clamp; rooms at all dirt levels; achievements for a perfect month; outfits; auto-update toast + reload; SW registers.
- Verified by the user on a phone: sync between devices, token paste in the Home Screen app, +30 after the early-tick fix, auto-update deploy.
- NOT verified: Rooms tab on a real phone; iOS clipboard permission prompt for Paste; flies animation performance on old phones; unauthenticated rate limit behaviour over hours; calendar subscription alerts on iPhone.

## F. Known limits / risks / gotchas
- Admin lock is honour-system: PIN hash in `state.json`; anyone with the token can edit the file on GitHub.
- Token = write access to repo contents; `main` is protected by the ruleset, `data` is not.
- Without a token: 60 API requests/h per IP; polling (180/h) + update check (12/h) will hit 403 after ~20 min of an open read-only app.
- Static ICS feeds don't include swaps (users download a snapshot).
- Web push isn't possible without a server; reminders come from calendar alerts + in-app notifications while open.
- Pages/CDN caches up to 10 min; the SW handles browser cache, not the CDN.
- Achievements are recomputed from history; changing a rule changes past awards too.

## G. Next steps (prioritised)
1. Real-phone check of the Rooms tab (layout, flies, tapping collectibles/outfits) and fix what's off. Start: `js/app.js` `roomsView`, `css/style.css`. Done when: user confirms on iPhone, logged in I.
2. Read-only rate limit: poll less (e.g. 2 min) without a token and back off on 403. Start: `js/store.js` (`POLL_MS`, `pull`), `js/app.js` (`checkForUpdate`). Done when: test covers back-off, no 403 in a 1 h headless run with a mocked limit.
3. Tutorial screenshots for Rooms (collectibles, outfits, dirt). Start: `scripts/tutorial-shots.mjs`, `TUTORIAL.md` §6.
4. ICS feeds that follow accepted swaps (generate from `state.json` in a scheduled Action or client-side download only).
5. Monthly recap card on the 1st (achievements earned, champion).

## H. Commands and rules
- `npm test` · `npm run check` · `npm run serve` · `npm run calendar`.
- Branch → PR → user merges. Never push `main`; touch `data` only when asked.
- After each completed step: entry in I.

## I. Change entries
Template (one entry per completed step, newest last):
```
### YYYY-MM-DD Title
- Changed: files / behaviour.
- Checked: tests, screenshots, numbers.
- Not verified: what was not run or seen.
```

### 2026-11-12 Personal rooms, monthly achievements, collectibles, outfits, dirt
- Changed: new `js/rooms.js` (8 monthly achievements, 13 collectibles from achievements + levels 2–6, slots shelf 3 / wall 2 / floor 3 / rug 1, 6 dirt levels, 128×80 room canvas); `js/sprites.js` outfits (7, unlocked at 0/1/2/3/5/7/10 achievements) via palette roles + cape; `js/app.js` Rooms tab, outfit everywhere, place/outfit actions; state fields `rooms[who].placed`, `outfits[who]`.
- Checked: headless with a simulated Nov (Pit perfect → 6 achievements, LV 4; Paco −300 → Biohazard; Hritik −5 → Unmade); screenshots of all three rooms and the full tab; 7 tabs fit at 390 px.
- Not verified: on a real phone.

### 2026-11-12 Agent workflow, regression test, this log
- Changed: `CLAUDE.md`, `.claude/agents/*` (explorer, tester, ui-checker, game-engineer, game-checker, pixel-artist, docs-release), `tests/run.mjs` + `npm test`/`npm run check`, `scripts/tutorial-shots.mjs`, `.gitignore` now only ignores `.claude/settings.local.json`.
- Checked: `npm test` ALL CHECKS PASSED (17); `npm run check` clean.
- Not verified: agents run end to end in a fresh session.

### 2026-11-12 Spelling: Hritik
- Changed: display name Hrithik → Hritik everywhere (app, page title, README, CLAUDE.md, log, `calendar/hrithik.ics` + `house.ics` regenerated, tutorial screenshots regenerated). Internal id `hrithik` and the feed filename kept so saved progress and calendar subscriptions keep working.
- Checked: `npm test` ALL CHECKS PASSED (17); pick-name screenshot shows "Hritik".
- Not verified: subscribed iPhone calendar picking up the renamed events.

### 2026-11-12 Home garden scene from Craftpix pixel assets
- Changed: new `js/home.js` + `img/home/` (only `exterior.png`, `Smoke_animation.png`, `CREDITS.txt` copied from the uploaded Craftpix pack; raw `Assets/` stays untracked). Rooms tab now opens with a top-down house; each roommate has a plant (Paco and Hritik an apple tree, Pit a bush) that withers into a dirt patch at dirt level ≥ 3. Chimney smoke is a CSS sprite animation. `npm run check` covers `home.js`.
- Checked: `npm test` passes; headless-browser screenshots of healthy and withered states and the Rooms tab at 390 px, no console errors.
- Not verified: on a real phone; the second pack (Pocket Inventory UI) is not used yet.

### 2026-11-12 Pixel UI kit replaces emojis, rounded boxes and the tab bar
- Changed: dropped the house scene (not wanted). New `js/ui.js` + `img/ui/`: (1) emojis in rendered text are swapped for icon sprites from the Pocket Inventory pack, or dropped (`iconize`, run after each render); (2) cards, banners, buttons, chips use 9-slice `border-image` panels built at runtime from the Complete UI Essential Pack frames (CC BY 4.0, credit in `img/ui/CREDITS.txt`), recoloured per state and per roommate; (3) bottom nav is round Pocket Inventory buttons with hover/pressed/selected states and a bobbing icon. Medals are now 1st/2nd/3rd text.
- Checked: `npm test` passes; headless-browser screenshots of Today and Rooms at 390 px, no emoji left in the DOM, no console errors from the new code.
- Not verified: Ranks, Calendar, Rules, Admin and login screens after the restyle; real phone; new emojis in future text map to nothing unless added to `MAP` in `js/ui.js`.

### 2026-11-12 Pixel font, no zoom, drawn hearts, box-free leaderboard, Ascent decor
- Changed: body font is Pixelify Sans (headings keep Press Start 2P); viewport locked (`user-scalable=no`, gesture/dblclick blocked, `touch-action: manipulation`, inputs 16 px so iOS doesn't zoom). Hearts are hand-drawn 7×7 sprites (`js/ui.js`). Scene name tags use framed panels in each roommate's colour. Leaderboard rows are now box-free (rank text, hero, coloured ribbon name, icon stats, hearts, dotted rule) and fit 375 px. New `js/decor.js`: sun, skyline, birds, planes, planets, satellites, rocket, moon, worms and buried pack items (key, chest, gems…) behind the heroes in the Ascent scene.
- Checked: `npm test` passes; 375 px headless screenshots of Ranks and Today; decor sprites drawn in isolation.
- Not verified: sky/space layers inside the live scene (test data keeps everyone underground); on a real phone; zoom lock on iOS Safari vs Home Screen app.

### 2026-11-12 Polling rate-limit back-off
- Changed: `js/store.js` polls every 120 s without a token (20 s with one) via a self-scheduling timer; a 403/429 backs off 5 → 10 → 30 min and resets on the next success; tab-focus refresh and the update check in `js/app.js` are skipped while rate limited. Section G item 2 is done.
- Checked: 5 new checks in `tests/run.mjs` (delays, back-off steps, cap, recovery); `npm test` ALL CHECKS PASSED (22).
- Not verified: a real 1 h run against api.github.com; the same session wrote code and checks (no separate game-checker pass).
