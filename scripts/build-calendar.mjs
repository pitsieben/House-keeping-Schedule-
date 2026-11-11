// Generates calendar/*.ics (one feed per roommate + one for the whole house).
// Run:  node scripts/build-calendar.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildICS, FEEDS } from '../js/ics.js';
import { CONFIG, parseYmd, addDays } from '../js/schedule.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'calendar');
mkdirSync(out, { recursive: true });

const from = parseYmd(CONFIG.trialStart);
const to = addDays(from, 365); // one year of schedule

for (const f of FEEDS) {
  writeFileSync(join(out, f.file), buildICS({ calName: f.name, from, to, who: f.who }));
  console.log('wrote calendar/' + f.file);
}
