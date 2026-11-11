// Shared game state. Works two ways:
//  • local  – saved in this browser only (demo / single device)
//  • cloud  – synced live between all roommates through Firebase Firestore (see README + firebase-config.js)
//
// State shape:
//  completions: { [dutyId]: { by, at } }
//  swaps:       { [dutyId]: { from, to, status: 'pending'|'accepted'|'declined', at, acceptedAt } }
//  excused:     { [dutyId]: { by, at } }      emergency excuse granted by another roommate
//  avatars:     { [roommateId]: 'sprite key' }
//  log:         { [timestamp-id]: { t, text } }  activity feed

const LOCAL_KEY = 'house-quest-state-v1';
const CODE_KEY = 'house-quest-house-code';

const empty = () => ({ completions: {}, swaps: {}, excused: {}, avatars: {}, log: {} });

function setPath(obj, path, value) {
  let o = obj;
  path.slice(0, -1).forEach((k) => { o = o[k] ||= {}; });
  const last = path[path.length - 1];
  if (value === undefined) delete o[last]; else o[last] = value;
}

class Store {
  constructor() {
    this.state = empty();
    this.mode = 'local';
    this.listeners = new Set();
    this.error = null;
    try { Object.assign(this.state, JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}')); } catch { /* ignore */ }
  }

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { this.listeners.forEach((fn) => fn(this.state)); }
  persist() { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(this.state)); } catch { /* ignore */ } }

  get houseCode() { return localStorage.getItem(CODE_KEY) || ''; }
  set houseCode(v) { localStorage.setItem(CODE_KEY, v.trim()); }

  get cloudAvailable() { return !!window.FIREBASE_CONFIG; }

  /** Connect to Firestore if configured and a house code is known. */
  async connect() {
    if (!this.cloudAvailable || !this.houseCode) return;
    try {
      await Promise.all([
        loadScript('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js'),
        loadScript('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js'),
      ]);
      if (!firebase.apps.length) firebase.initializeApp(window.FIREBASE_CONFIG);
      this.db = firebase.firestore();
      this.ref = this.db.collection('houses').doc(this.houseCode);
      this.ref.onSnapshot(
        (snap) => {
          this.mode = 'cloud'; this.error = null;
          this.state = { ...empty(), ...(snap.exists ? snap.data() : {}) };
          this.persist(); this.emit();
        },
        (err) => { this.mode = 'local'; this.error = err.message; this.emit(); },
      );
    } catch (e) {
      this.error = e.message; this.mode = 'local'; this.emit();
    }
  }

  /** Apply a change locally right away, then push it to the cloud (merge = no overwriting of other roommates' data). */
  patch(path, value) {
    setPath(this.state, path, value);
    this.persist(); this.emit();
    if (this.mode === 'cloud' && this.ref) {
      const nested = {};
      setPath(nested, path, value === undefined ? firebase.firestore.FieldValue.delete() : value);
      this.ref.set(nested, { merge: true }).catch((e) => { this.error = e.message; this.emit(); });
    }
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

function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res();
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src));
    document.head.appendChild(s);
  });
}

export const store = new Store();
