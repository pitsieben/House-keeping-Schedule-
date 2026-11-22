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

### 2026-11-12 Ascent decor removed
- Changed: deleted `js/decor.js` and its CSS; the Ascent scene is back to its original layers (stars, clouds, bones, flames) with no extra sprites.
- Checked: `npm test` ALL CHECKS PASSED (22).
- Not verified: visually in the live scene.

### 2026-11-12 Ascent sky and ground follow time of day and weather
- Changed: new `js/sky.js` + `img/sky/` (8 cloud sets from the Clouds pack). The set is chosen from the phase of day (night, dawn, morning, day, golden hour, dusk, twilight, relative to sunrise/sunset) and the weather (clear, partly, cloudy, fog, rain, snow, storm); grey weather uses the overcast set plus a tint, rain/snow/storm add animated overlays. The sky picture fades into the space layers. The ground gets a colour wash by phase, a wet tint in rain/fog, a snow cap, and a grass colour. Weather + sunrise/sunset come from Open-Meteo for Barcelona coordinates (no key, no personal data), cached 30 min in localStorage; offline falls back to clear with 07:30/18:00. Test with `?now=…&weather=rain|snow|storm|fog|cloudy|partly|clear`.
- Checked: `npm test` passes; screenshots for dusk/clear, midday/rain and night/snow.
- Not verified: real Open-Meteo response in the browser; sky layers high above the ground (needs positive scores); phone.

### 2026-11-12 Detailed ground textures
- Changed: new `js/ground.js` draws 96×96 px tiles on a canvas (shown at 2x) for each underground layer: dirt with roots and pebbles, sandy bone layer with strata, cracked rock, crust with strata and gold flecks, mantle swirls, glowing magma. The grass edge is a drawn blade tile in the weather/time grass colour and now sits on the ground line. Time-of-day/weather washes still apply on top.
- Checked: `npm test` passes; screenshot of the full scene at midday/clear.
- Not verified: other times/weather with the new textures; phone.

### 2026-11-13 Fix sky flicker on re-render
- Changed: `render()` in `js/app.js` skips the DOM update when the markup is identical (polls with unchanged data), and when it does re-render it keeps the existing `.scene` node if its markup is unchanged, so the sky/ground images are not rebuilt and re-decoded (that was the brief flash every ~20-30 s).
- Checked: with a log change forcing a re-render, the same scene node survived; mutation count over 40 s dropped from 22 to 2.
- Not verified: on a phone over time.

### 2026-11-13 Chat: speech bubbles above the heroes
- Changed: `js/app.js` (`chatBubbles`, `sayBox`, `openMessages`, `relTime`, `notifyMessages`, actions `msgclose`/`msgcloseall`, say-form submit, unread badge on Today); `css/style.css` (bubble, tails, say box, badge). State field `messages[id] = { from, text, at, closed: { who: t } }`; closing is per reader; on send, messages older than 14 days or closed by all three are pruned. Bubbles render in a `.chatlayer` overlay next to `.scene`, so the scene markup (and the anti-flicker reuse in `render()`) is unaffected by the ticking "min ago" text.
- Checked: headless with mocked GitHub: single bubble above the sender (tail ends on the head), 3 senders merged into one bubble with 3 tails, send → PUT contains the message, ✕ → `closed.pit` set, badge counts others' unclosed messages; notifications: none for messages present at first load, one for a new message from someone else, none for your own; overlay box equals `.world` box; `npm test` ALL CHECKS PASSED.
- Not verified: on a real iPhone (notification while backgrounded, keyboard over the say box). No push when the app is fully closed (needs a push server).

### 2026-11-13 Chat bubbles in pixel-art style
- Changed: `.pxbox` frame in `css/style.css` (4 px "pixels": black outline with stepped corners via `::before`/`::after` + corner squares, grey shade row along the inside bottom, after the user's reference image) for the chat bubble and the say box; stepped pixel tail `.btip` (leans left; mirrored `.up` on the say box) + dotted `.bline` to the sender's head; `layoutChat()` in `js/app.js` positions tails under the bubble's real bottom after each render (and after fonts load).
- Checked: headless 3× zoom crops of the bubble and say box; merged bubble with three tails; send/close flow still passes; `npm test` ALL CHECKS PASSED.
- Not verified: on a real phone.

### 2026-11-13 Easter egg: House Jump (Doodle-Jump climb to the Moon)
- Changed: new `js/jump.js` (`openJump`, full-screen 180×320 pixel canvas; fixed 60 Hz physics; platforms normal / moving / crumbling decoys / springs; altitude `metersAt(px) = 10·(10^(px/1200) − 1)`: space at 4,800 px, Moon at ~9,100 px = win; sky colour, clouds, airliner, stars, Moon by altitude; controls: hold left/right half, ← →, or tilt; hero drawn in the player's outfit). `js/app.js`: tap your own hero in the leaderboard scene (`data-act="jump"`); best height saved to `state.jump[who] = { best, at }` (and localStorage) and shown as a top-3 jump board. `css/style.css` overlay. Tests: gap ≤ 58 px vs 75.4 px jump, space/Moon calibration, early counter.
- Checked: `npm test` ALL CHECKS PASSED (26); headless: opens from the hero, closes, screenshots at start / 3 km / 12 km / 365 km / Moon (win screen) / game over with NEW BEST + board; best saved to the mocked `state.json`. Found and fixed: frame-rate-dependent jump height (could make gaps unreachable on slow phones).
- Not verified: tilt control and feel on a real phone (iOS asks for motion permission on the first tap).

### 2026-11-14 Evening deadline → midnight; holidays
- Changed: `js/schedule.js` `CONFIG.eveningDeadline` `[22, 30]` → `[24, 0]` (= 00:00 next day) and calendar window `evening` → 22:30–24:00 (alerts 22:30 and 23:00); "pre-game" now compares the duty **date** with `penaltyStart` (with a midnight deadline, 11 Nov's evening would otherwise have become a penalty). Holidays: `state.holidays[who] = [{ from, to }]`, `holidayOf()`, new status `holiday` (before `excused`, after completions) that scores nothing and counts for nothing (week, month achievements). `js/app.js`: "midnight" in deadline text (`fmtDue`), holiday chip/icons, no Done button, no reminders, Today banner, Rules → ✈ Holidays card (add from today on, remove future ones, "I'm back early" ends it yesterday), away roommates fly a plane (`planeURL` in `js/sprites.js`) in the leaderboard background and don't steer the camera. Calendar feeds regenerated; TUTORIAL/README updated.
- Checked: `npm test` ALL CHECKS PASSED (35, incl. midnight, pre-game and 5 holiday checks); live `state.json` scores identical before/after the deadline change; headless: plane + tag, banner, "On holiday" duty with no Done button, add holiday saved, past start rejected.
- Not verified: on a real phone; static calendar feeds still list a holiday-maker's duties (feeds don't read `state.json`).

### 2026-11-17 Take-overs ("can't make it" / "I did this one") + shared bathroom
- Changed: `js/schedule.js`: `state.covers[dutyId]` (`requested` → `taken` before the deadline; or `claimed` by a helper up to `claimWindowHours` 24 h after the deadline → `confirmed` by the owner, auto after `claimAutoConfirmHours` 48 h); `baseAssigneeOf` (swaps only) vs `assigneeOf` (+ take-over); status `claimed` is neutral while pending; confirmed claims score as done for the helper, nothing for the owner. `BATHROOM` weekly duty `<date>:bath` for Hritik/Pit alternating from Sun 22 Nov. `js/app.js`: buttons on duty cards, banners (take-over requests, claims to confirm), 🕑 Yesterday section on Today, admin confirm/remove, rules text. `js/rooms.js`: `claimed` ignored, early-bird uses the claim time. Calendar feeds regenerated; TUTORIAL updated.
- Checked: `npm test` ALL CHECKS PASSED (46, incl. 8 take-over and 3 bathroom checks); headless with the live `state.json`: Pit claims Mon 16 Nov evening → Paco's banner → confirm → Paco 70 → 85, Pit 0 → +10; Paco "can't make it" tonight → Hritik takes over and gets the Done button.
- Not verified: on a real phone.

### 2026-11-17 In-app "What's new" board
- Changed: new `js/changelog.js` (17 entries covering PRs #1–#17, newest first; the House Jump easter egg only as a hint); `js/app.js`: pinned-notes board at the top of the Rules tab (5 newest, "Show all"), NEW tags for entries newer than `localStorage['house-quest-news-seen']` (frozen while the tab is open), Today banner "New: … + N more" with Read / ✕; CSS cork board. CLAUDE.md: add a changelog entry for every user-facing change.
- Checked: headless: banner shows 3 new since id 14 → Read opens the board with 3 NEW tags → banner gone afterwards; screenshot of the board; `npm test` passes.
- Not verified: on a real phone.

### 2026-11-17 Plants: weekly shared bonus task + Green Thumb
- Changed: `js/schedule.js` `PLANTS`, Tuesday duty `<date>:plants` (`kind: 'plants'`, `assignee: null`, `anyone: true`, opens Monday, due Tue midnight), `POINTS.done.plants = 5` / `miss.plants = 0`, `statusOf` → `open` / `future` / `skipped` (never missed), `computeScores` credits `completions[id].by` (caught fake −10). `js/rooms.js` achievement `green` (≥ 3 waterings in a month) → new shelf collectible `cactus`. `js/app.js` `plantsCard` (Today on Mon/Tue, "Up for grabs"), `ownerOf()` for owner-less duties in actions/admin, Week table line, chip `skipped`. `js/ics.js` house feed only (Tue 18:00, no alarm). Changelog #18, TUTORIAL.
- Checked: `npm test` ALL CHECKS PASSED (52, incl. 6 plants checks); headless with the live `state.json` on Tue 17 Nov: card shown, watering → Pit 0 → +5, Week/Admin/Rooms tabs render without page errors.
- Not verified: on a real phone; the cactus sprite in a room (only checked that it's listed).

### 2026-11-18 "Can't make it" cutoff
- Changed: `js/schedule.js` `cantMakeItUntil(duty)` (`CANT_MAKE_IT_HOURS = 4`: resets until deadline − 4 h, i.e. morning 08:00 / evening 20:00; weekly cleaning until the end of the day before); `js/app.js` button shows "(until …)", after the cutoff a hint instead of the button, action re-checks the cutoff; rules text, TUTORIAL, changelog #19.
- Checked: `npm test` ALL CHECKS PASSED (55, incl. 3 cutoff checks); headless: morning 07:30 button / 09:00 hint, evening 19:30 button / 20:30 hint, bathroom Sat 23:00 button / Sun 09:00 hint.
- Not verified: on a real phone. Requests made before this change stay valid.

### 2026-11-21 "Can't make it" + nobody takes over = no penalty
- Changed: `js/schedule.js` `statusOf`: a `requested` cover made by the cutoff (`cantMakeItUntil`) and never taken → new neutral status `released` after the deadline (also when the owner ticks it late); doing it on time still scores. `js/rooms.js` ignores `released`; `js/app.js` chip "🙋 Nobody took it · 0 pts", Week icon, card note, rules text, "I did this one" still possible. Changelog #20, TUTORIAL.
- Checked: `npm test` ALL CHECKS PASSED (59, incl. 4 released checks); live `state.json`: Pit's request for Fri 20 Nov evening (18:26, before the 20:00 cutoff) → was missed, now released: Pit 30 → 45, strikes 1 → 0, others unchanged; headless card note + Week icon, no page errors.
- Not verified: on a real phone.

### 2026-11-21 Monthly "can't make it" limits, "not home", stricter perfect week
- Changed: `js/schedule.js`: `CANT_MAKE_IT_LIMITS` (per calendar month: 3× resets, 1× weekly cleaning), `cantMakeItRequests` / `cantMakeItLeft`; a request over the limit is never `released`. `state.away[who]` + `awayOf()`: duty still due, anyone may tick it (`assigneeOf` → whoever did it), nobody → `released` (holiday wins over not home). Perfect week: from `CONFIG.strictPerfectWeekFrom` (2026-11-16) only if every duty of yours was done on time by you and no swap / take-over / hand-over / excuse / holiday touched your week; earlier weeks keep the old rule. `js/app.js`: "x left this month" on the button / "none left" hint, Holidays & not home card (type select, back early / remove per type), "I'll do it" for others + note + Today banner, no reminders while not home, points table, rules text. Changelog #21–23, TUTORIAL.
- Checked: `npm test` ALL CHECKS PASSED (71, incl. 5 limit, 3 not-home, 4 perfect-week checks); live `state.json`: all scores unchanged (Paco 78, Pit 45, Hritik 78; the 9–15 Nov perfect weeks kept); headless: quota on the buttons (2 left / 1 left), not home saved, Hritik does Pit's duty on 25 Nov.
- Not verified: on a real phone.

### 2026-11-22 Bathroom: no points, still a penalty
- Changed: `js/schedule.js` `donePoints(duty)` (0 for `noPoints` duties), bathroom duties get `noPoints: true`; all point awards (done, steals, plants, achievements' month points in `js/rooms.js`) go through `donePoints`; penalties unchanged (−30, late −15, strike, fake 2×). `js/app.js`: "Done (no points)", note on the card, no "+0" in buttons/banners/toasts/log, rules text. Changelog #24, TUTORIAL.
- Checked: `npm test` ALL CHECKS PASSED (75, incl. 4 bathroom-points checks); live `state.json`: only change is Pit's steal of Hritik's faked 22 Nov bathroom, which now gives 0 instead of +30 (Pit 125 → 95; Paco 88 and Hritik 48 unchanged); headless bathroom card.
- Not verified: on a real phone.

### 2026-11-22 Bathroom: half penalty
- Changed: `js/schedule.js` `missPoints(duty)` (halved for `halfPenalty` duties; bathroom has it): missed −15, late −7, caught fake −30, strike unchanged; `computeScores`, `js/rooms.js` and all penalty texts in `js/app.js` use it. Changelog #24 and TUTORIAL updated.
- Checked: `npm test` ALL CHECKS PASSED (76); live `state.json` (main → this PR): Hritik 48 → 78 (22 Nov bathroom fake −60 → −30), Pit 125 → 95 (steal gives 0), Paco 88 unchanged.
- Not verified: on a real phone.

### 2026-11-22 Gentler leaderboard scale, exponential levels
- Changed: `js/app.js` scale `PTS_PER_DECADE = 50` (was 20): meters = 10^(|pts|/50) − 1 → 100 pts ≈ 100 m, 200 ≈ 10 km, 250 ≈ 100 km (space), ~430 = Moon; `LAYERS` thresholds ×2.5 (same meters), clamp `PTS_MIN/MAX` −325…430, ruler ticks every 25 pts (major 50), labels from 10 m. `js/schedule.js` levels: `levelXp(lv) = 75 · 2^(lv−1)` (level 0 below 75 XP), endless titles (`levelTitle`), `levelFor` returns level/base/next; `js/rooms.js` level collectibles at levels 1–5 (75…1,200 XP). Rules text, changelog #25–26.
- Checked: `npm test` ALL CHECKS PASSED (80, incl. 4 level checks); headless with live data: Paco +88 → 57 m, Pit +95 → 78 m, Hritik +78 → 35 m (were in space), all LV 1; screenshot of the scene.
- Not verified: on a real phone.

### 2026-11-22 Endless sky + landmarks by height
- Changed: `js/app.js` scene: above-ground layer bands replaced by one continuous gradient (`skyStops(phase, grey)`: low colours follow time of day/weather, then deep blue → black space), starfield fading in from ~25 km, the cloud picture now spans ground → 3 km (was stuck at the old-scale `yOf(94)`) and fades out at its top (CSS mask); `ptsOf(m)` helper. New `js/props.js`: pixel landmarks at real heights (birds 8–70 m, balloons, a house on balloons ~950 m, small plane 2.6 km, airliners 9–11.5 km, weather balloon 31 km, space junk 260 km–24,000 km, ISS 408 km, satellites, geostationary 35,800 km, Moon; below: ammonite, dinosaur skeletons, chests, nuclear waste ~600 m, mines 1.6/3.5 km, Kola borehole 12.3 km), animated (fly / drift / bob, reduced-motion respected), only rendered when in view. Changelog #27.
- Checked: headless screenshots at 7 heights (ground, clouds, planes, space, Moon, dinosaurs, deep) by day and 2 at night; no page errors; `npm test` passes.
- Not verified: on a real phone (animation smoothness).

### 2026-11-22 Barcelona skyline at ground level
- Changed: `js/props.js` `skyline(night)` (160×44 pixel sprite: Tibidabo hill + church, Montjuïc, Eixample blocks with windows, Sagrada Família with 8 facade spires and the central tower with its cross, Torre Glòries; night palette with lit windows), placed in `js/app.js` on the grass behind the heroes (`.skyline`, full scene width), night for dusk/twilight/night. Sagrada Família sits between the 1st and 2nd hero, Torre Glòries between the 2nd and 3rd, so they stay visible. Changelog #28.
- Checked: headless screenshots by day, golden hour and night; no page errors; `npm test` passes.
- Not verified: on a real phone.

### 2026-11-22 Plants status bubble + notification
- Changed: `js/app.js` `weekPlants(now)` (this week's Tuesday plants duty), `plantsPill(now)` under the captain/laundry line on Today all week (yellow open "not watered yet · until Tue midnight · +5", green "watered by X · day time", red "nobody watered" / fake), `notifyPlants()` (once per week when someone else waters them; first run on a phone only seeds `house-quest-plants-notified`); CSS `.plantpill`. Changelog #29.
- Checked: headless Mon open / Tue + Thu watered / Thu skipped; notification fired on Hritik's phone when Paco watered after load; `npm test` passes.
- Not verified: on a real phone.
