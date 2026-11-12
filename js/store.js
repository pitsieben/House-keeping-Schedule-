// Shared game state. Works two ways:
//  • local  – saved in this browser only (demo / single device)
//  • cloud  – synced between all roommates through a JSON file on this GitHub repo's `data` branch
//
// State shape:
//  completions: { [dutyId]: { by, at } }
//  swaps:       { [dutyId]: { from, to, status: 'pending'|'accepted'|'declined', at, acceptedAt } }
//  excused:     { [dutyId]: { by, at } }      emergency excuse granted by another roommate
//  avatars:     { [roommateId]: 'sprite key' }
//  log:         { [timestamp-id]: { t, text } }  activity feed

const LOCAL_KEY = 'house-quest-state-v2';
const QUEUE_KEY = 'house-quest-pending-v2';
const TOKEN_KEY = 'house-quest-gh-token';

// Progress is stored as data/state.json on a dedicated `data` branch of this GitHub repo
// (so it never triggers a Pages rebuild). Reading is public; writing needs a fine-grained token.
const REPO = 'pitsieben/House-keeping-Schedule-';
const BRANCH = 'data';
const FILE = 'state.json';
const API = `https://api.github.com/repos/${REPO}`;
const POLL_MS = 20000;

const empty = () => ({ completions: {}, swaps: {}, excused: {}, avatars: {}, log: {} });

function setPath(obj, path, value) {
  let o = obj;
  path.slice(0, -1).forEach((k) => { o = o[k] ||= {}; });
  const last = path[path.length - 1];
  if (value === undefined) delete o[last]; else o[last] = value;
}

const b64decode = (b) => new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\n/g, '')), (c) => c.charCodeAt(0)));
const b64encode = (str) => { let bin = ''; new TextEncoder().encode(str).forEach((c) => { bin += String.fromCharCode(c); }); return btoa(bin); };

class Store {
  constructor() {
    this.state = empty();
    this.mode = 'local';          // 'local' (no token / offline) | 'cloud' (synced via GitHub)
    this.listeners = new Set();
    this.error = null;
    this.etag = null;
    this.remote = empty();        // last state known from GitHub (without pending patches)
    this.pending = [];            // [{ path, value?, del? }] not yet committed
    try { this.pending = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { /* ignore */ }
    try { Object.assign(this.remote, JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}')); } catch { /* ignore */ }
    this.rebuild();
  }

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { this.listeners.forEach((fn) => fn(this.state)); }
  persist() {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(this.remote));
      localStorage.setItem(QUEUE_KEY, JSON.stringify(this.pending));
    } catch { /* ignore */ }
  }

  /** state = last remote snapshot + any local changes not yet committed */
  rebuild() {
    this.state = { ...empty(), ...JSON.parse(JSON.stringify(this.remote)) };
    this.pending.forEach((p) => setPath(this.state, p.path, p.del ? undefined : p.value));
  }

  get token() { return localStorage.getItem(TOKEN_KEY) || ''; }
  set token(v) { v ? localStorage.setItem(TOKEN_KEY, v.trim()) : localStorage.removeItem(TOKEN_KEY); }
  get canWrite() { return !!this.token; }

  headers(extra = {}) {
    const h = { Accept: 'application/vnd.github+json', ...extra };
    if (this.token) h.Authorization = `Bearer ${this.token}`;
    return h;
  }

  /** Start polling GitHub for the shared state. */
  async connect() {
    if (!this.timer) {
      this.timer = setInterval(() => this.pull(), POLL_MS);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) this.pull(); });
    }
    await this.pull();
    if (this.pending.length) this.flush();
  }

  async fetchRemote(useEtag) {
    const headers = this.headers(useEtag && this.etag ? { 'If-None-Match': this.etag } : {});
    const res = await fetch(`${API}/contents/${FILE}?ref=${BRANCH}&_=${useEtag ? '' : Date.now()}`, { headers, cache: 'no-store' });
    if (res.status === 304) return null;
    if (res.status === 404) return { state: empty(), sha: null, missing: true };
    if (!res.ok) throw new Error(`GitHub ${res.status}`);
    if (useEtag) this.etag = res.headers.get('etag');
    const j = await res.json();
    return { state: { ...empty(), ...JSON.parse(b64decode(j.content)) }, sha: j.sha };
  }

  async pull() {
    if (this.flushing) return;
    try {
      const r = await this.fetchRemote(true);
      this.mode = 'cloud'; this.error = null;
      if (r && !r.missing) { this.remote = r.state; this.persist(); this.rebuild(); }
      this.emit();
    } catch (e) {
      this.mode = 'local'; this.error = e.message; this.emit();
    }
  }

  /** Commit pending changes: re-read latest, apply our patches on top (so nobody's data is overwritten), retry on conflict. */
  async flush() {
    if (this.flushing || !this.pending.length || !this.canWrite) return;
    this.flushing = true;
    try {
      for (let attempt = 0; attempt < 5 && this.pending.length; attempt++) {
        const batch = this.pending.slice();
        const r = await this.fetchRemote(false);
        if (r.missing) await this.ensureBranch();
        const next = JSON.parse(JSON.stringify(r.state));
        batch.forEach((p) => setPath(next, p.path, p.del ? undefined : p.value));
        const body = { message: 'House Quest: update progress', branch: BRANCH, content: b64encode(JSON.stringify(next, null, 1)) };
        if (r.sha) body.sha = r.sha;
        const res = await fetch(`${API}/contents/${FILE}`, { method: 'PUT', headers: this.headers({ 'Content-Type': 'application/json' }), body: JSON.stringify(body) });
        if (res.status === 409 || res.status === 422) continue; // someone else committed first → retry on fresh data
        if (!res.ok) throw new Error(res.status === 401 || res.status === 403 || res.status === 404 ? `Token rejected (${res.status}) — check it has Contents: write on this repo` : `GitHub ${res.status}`);
        this.pending = this.pending.slice(batch.length);
        this.remote = next; this.etag = null;
        this.persist(); this.rebuild();
        this.mode = 'cloud'; this.error = null;
      }
    } catch (e) {
      this.error = e.message;
    } finally {
      this.flushing = false;
      this.emit();
    }
  }

  async ensureBranch() {
    const repo = await (await fetch(API, { headers: this.headers() })).json();
    const base = await (await fetch(`${API}/git/ref/heads/${repo.default_branch}`, { headers: this.headers() })).json();
    const res = await fetch(`${API}/git/refs`, {
      method: 'POST', headers: this.headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ ref: `refs/heads/${BRANCH}`, sha: base.object.sha }),
    });
    if (!res.ok && res.status !== 422) throw new Error(`Could not create data branch (${res.status})`);
  }

  /** Apply a change locally right away, queue it, and commit to GitHub in the background. */
  patch(path, value) {
    this.pending.push(value === undefined ? { path, del: true } : { path, value });
    this.persist(); this.rebuild(); this.emit();
    clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => this.flush(), 500);
  }

  say(text, now = Date.now()) { this.patch(['log', `${now}-${Math.random().toString(36).slice(2, 6)}`], { t: now, text }); }

  complete(id, by, now) { this.patch(['completions', id], { by, at: now }); }
  undo(id) { this.patch(['completions', id], undefined); }
  excuse(id, by, now) { this.patch(['excused', id], { by, at: now }); }
  unexcuse(id) { this.patch(['excused', id], undefined); }
  requestSwap(id, from, to, now) { this.patch(['swaps', id], { from, to, status: 'pending', at: now }); }
  respondSwap(id, accept, now) {
    const sw = this.state.swaps[id];
    this.patch(['swaps', id], { ...sw, status: accept ? 'accepted' : 'declined', acceptedAt: accept ? now : null });
  }
  cancelSwap(id) { this.patch(['swaps', id], undefined); }
  setAvatar(who, key) { this.patch(['avatars', who], key); }
}

export const store = new Store();
