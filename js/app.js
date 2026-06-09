/* ================= The League — World Cunt 2026 ================= */
'use strict';

const LS_KEY = 'wc26-draft-league';
const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world';
const TOURN_RANGE = '20260611-20260720';

const TEAM_BY_NAME = Object.fromEntries(TEAMS.map(t => [t.name, t]));
const PLAYER_BY_ID = Object.fromEntries(PLAYERS.map(p => [p.id, p]));
const POS_ORDER = { GK: 0, DF: 1, MF: 2, FW: 3 };
const POS_LABEL = { GK: 'Goalkeepers', DF: 'Defenders', MF: 'Midfielders', FW: 'Forwards' };

const DEFAULT_SCORING = {
  start: 2,
  sub: 1,
  goalGK: 6, goalDF: 6, goalMF: 5, goalFW: 4,
  assist: 3,
  cleanSheet: 4,
};
const SCORING_LABELS = {
  start: 'Start',
  sub: 'Sub appearance',
  goalGK: 'Goal — GK', goalDF: 'Goal — DF', goalMF: 'Goal — MF', goalFW: 'Goal — FW',
  assist: 'Assist',
  cleanSheet: 'Clean sheet — GK/DF',
};
// starting XI shape
const XI_RULES = { size: 11, GK: [1, 1], DF: [3, 5], MF: [2, 5], FW: [1, 3] };

/* ---------------- Moggi desk ---------------- */
const MOGGI_QUOTES = [
  'A fine pick. The referees have been informed.',
  'I made three phone calls. He was always coming to you.',
  'Don’t thank me. Officially, we never spoke.',
  'His bookings this tournament will be… managed.',
  'I know his agent. I know everyone’s agent.',
  'The draft order was random, of course. Everything is always random.',
  'He’ll win penalties. I’ve spoken to the right people.',
  'Good. Now delete this conversation.',
  'A bold selection. The linesmen owe me a favour anyway.',
  'Trust the process. The process is me.',
];
const moggiSays = () => `Moggi: “${MOGGI_QUOTES[Math.floor(Math.random() * MOGGI_QUOTES.length)]}”`;

const INTERCEPTS = [
  'Listen carefully, {name}. The player you want… he is already yours. I made the call an hour ago.',
  '{name}, my friend. The other three suspect nothing.',
  'Tell {name} the medical was passed. We did not look too closely.',
  '{name} hesitates. Weakness. In my day we drafted by fax and fear.',
  'The scouts recommended a defender. I recommended ignoring the scouts. {name} understands.',
  'If {name} picks another goalkeeper, the federation will have questions.',
  'The room is clean, {name}. I swept it myself. Twice.',
  '{name} is on the clock. The clock, naturally, reports to me.',
  'Whatever {name} selects, write down that it was always the plan.',
  'Remind {name}: a snake draft has two ends, and I have friends at both.',
];
const interceptFor = (n, name) =>
  INTERCEPTS[n % INTERCEPTS.length].replaceAll('{name}', name);

const INVESTIGATIONS = [
  'Intercepted call, 02:41 — “{L} cannot keep getting away with this. Find out which referees they know.”',
  'The committee notes {L}’s points total “with interest”. {B} has been offered Serie B and a plea deal.',
  'Moggi’s verdict: “{L}? Talented. Connected. Probably both.” {B} has been reported to the authorities, who laughed.',
  'Forensics found nothing on {L}’s phone. Forensics also found that {L} has two phones. {B} has been eliminated from enquiries — and from contention.',
  'An anonymous source close to {L} says it’s all legitimate. The source sounded exactly like {L}.',
];
const investigationLine = (L, B) => {
  const day = new Date().getDate();
  return INVESTIGATIONS[day % INVESTIGATIONS.length].replaceAll('{L}', L).replaceAll('{B}', B);
};

/* ---------------- gameweeks ---------------- */
// Boundaries in UTC with buffer so late US-west kickoffs land in the right week
const GAMEWEEKS = [
  { n: 1, label: 'Matchday 1', to: '2026-06-18T09:00Z' },
  { n: 2, label: 'Matchday 2', to: '2026-06-24T09:00Z' },
  { n: 3, label: 'Matchday 3', to: '2026-06-28T09:00Z' },
  { n: 4, label: 'Round of 32', to: '2026-07-04T09:00Z' },
  { n: 5, label: 'Round of 16', to: '2026-07-08T09:00Z' },
  { n: 6, label: 'Quarter-finals', to: '2026-07-12T09:00Z' },
  { n: 7, label: 'Semis & Final', to: '2026-07-20T12:00Z' },
];
const gwFrom = i => i === 0 ? '2026-06-11T00:00Z' : GAMEWEEKS[i - 1].to;
const inGw = (dateIso, i) => {
  const t = new Date(dateIso).getTime();
  return t >= new Date(gwFrom(i)).getTime() && t < new Date(GAMEWEEKS[i].to).getTime();
};
function currentGwIndex() {
  const now = Date.now();
  for (let i = 0; i < GAMEWEEKS.length; i++) if (now < new Date(GAMEWEEKS[i].to).getTime()) return i;
  return GAMEWEEKS.length - 1;
}
const gwIsOver = i => Date.now() > new Date(GAMEWEEKS[i].to).getTime();
const gwHasStarted = i => Date.now() > new Date(gwFrom(i)).getTime() && i <= currentGwIndex();
// rotation: 3 unique rounds for 4 managers, repeating
const H2H_ROUNDS = [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]];
const pairingsFor = i => {
  const o = state.draft.order.length ? state.draft.order : state.managers.map(m => m.id);
  return H2H_ROUNDS[i % 3].map(([a, b]) => [o[a], o[b]]);
};

/* ---------------- state ---------------- */
let state = load() || freshState();

/* ---------------- multiplayer (Firebase sync) ---------------- */
const SYNC_OFF = new URLSearchParams(location.search).has('nosync');
const WHO_KEY = 'wc26-whoami';
let whoami = +localStorage.getItem(WHO_KEY) || null; // manager id, -1 = spectator
let syncConnected = false;
let demoMode = false;
let demoBackup = null;
const syncOn = () => !SYNC_OFF && !!window.WCSync;
const netOn = () => syncOn() && !demoMode;
const isCommissioner = () => whoami === state.managers[0]?.id;
const canActFor = mid => demoMode || !syncOn() || whoami === mid || isCommissioner();

const SHARED_KEYS = ['phase', 'managers', 'settings', 'draft', 'lineups', 'transfers', 'waivers', 'adjustments', 'playerMap'];
function sharedSnapshot() {
  const o = {};
  for (const k of SHARED_KEYS) o[k] = state[k];
  return o;
}
function pushShared(path, val) {
  if (netOn()) window.WCSync.set(path, val).catch(e => console.warn('[sync] write failed', e));
}
function publishAll() {
  if (netOn()) window.WCSync.setRoot(sharedSnapshot()).catch(e => console.warn('[sync] publish failed', e));
}
const toArr = x => Array.isArray(x) ? x : (x ? Object.values(x) : []);

window.onSharedSnapshot = data => {
  if (SYNC_OFF || demoMode) return;
  if (!data) {
    // cloud league is empty — publish if a game already started locally
    if (state.phase !== 'setup') publishAll();
    render();
    return;
  }
  data.managers = toArr(data.managers);
  data.draft = data.draft || {};
  data.draft.order = toArr(data.draft.order);
  data.draft.picks = toArr(data.draft.picks);
  data.transfers = toArr(data.transfers);
  data.lineups = data.lineups || {};
  for (const mid of Object.keys(data.lineups)) {
    data.lineups[mid] = data.lineups[mid] || {};
    for (const gw of Object.keys(data.lineups[mid])) data.lineups[mid][gw] = toArr(data.lineups[mid][gw]);
  }
  data.waivers = data.waivers || {};
  for (const gw of Object.keys(data.waivers)) data.waivers[gw] = { actions: toArr(data.waivers[gw].actions) };
  data.adjustments = data.adjustments || {};
  data.playerMap = data.playerMap || {};
  for (const k of SHARED_KEYS) if (data[k] !== undefined) state[k] = data[k];
  if (state.settings.maxPerCountry == null) state.settings.maxPerCountry = 3;
  save(); render();
};
window.onSyncConnection = up => { syncConnected = up; renderSyncArea(); };

function freshState() {
  return {
    phase: 'setup', // setup | draft | season
    managers: [
      { id: 1, name: 'Ben Polak' }, { id: 2, name: 'Mrc Cnwy' }, { id: 3, name: 'Iain Tussie' }, { id: 4, name: 'Rick Blank' },
    ],
    settings: {
      squadSize: 15,
      quotas: { GK: 2, DF: 5, MF: 5, FW: 3 },
      maxPerCountry: 3,
      scoring: { ...DEFAULT_SCORING },
    },
    draft: { order: [], picks: [] },
    lineups: {},           // managerId -> { gwIndex: [pid x11] }
    transfers: [],         // [{managerId, outId, inId, gw, n, trade?}]
    waivers: {},           // gwIndex -> { actions: [{mid, outId?, inId?, pass?}] }
    fixtures: [],
    matchStats: {},        // eventId -> { label, date, final, playerStats: {pid:{st,sub,g,a,cs}} }
    playerMap: {},
    unmatched: [],
    adjustments: {},
    lastSync: null,
    view: 'draft',
  };
}
function save() { if (!demoMode) localStorage.setItem(LS_KEY, JSON.stringify(state)); }
const rating = p => p.goals * 3 + p.caps;

/* ---------------- demo mode ---------------- */
function buildDemoState() {
  const s = freshState();
  s.phase = 'season';
  s.view = 'team';
  s.draft.order = [2, 4, 1, 3];
  const sorted = [...PLAYERS].sort((a, b) => rating(b) - rating(a));
  const taken = new Set();
  const counts = {}, nations = {};
  s.managers.forEach(m => { counts[m.id] = { GK: 0, DF: 0, MF: 0, FW: 0 }; nations[m.id] = {}; });
  const q = s.settings.quotas, maxC = s.settings.maxPerCountry;
  for (let n = 0; n < 60; n++) {
    const m = 4, round = Math.floor(n / m), idx = n % m;
    const mid = round % 2 === 0 ? s.draft.order[idx] : s.draft.order[m - 1 - idx];
    const p = sorted.find(p => !taken.has(p.id) && counts[mid][p.pos] < q[p.pos] && (nations[mid][p.team] || 0) < maxC);
    taken.add(p.id);
    counts[mid][p.pos]++;
    nations[mid][p.team] = (nations[mid][p.team] || 0) + 1;
    s.draft.picks.push({ managerId: mid, playerId: p.id, n: n + 1 });
  }
  // fabricate Matchday 1 results for everyone drafted
  const ps = {};
  let seed = 42;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (const pk of s.draft.picks) {
    const p = PLAYER_BY_ID[pk.playerId];
    const started = rnd() < 0.8;
    const goalChance = { FW: 0.35, MF: 0.2, DF: 0.07, GK: 0.005 }[p.pos];
    ps[p.id] = {
      st: started ? 1 : 0,
      sub: started ? 0 : (rnd() < 0.6 ? 1 : 0),
      g: rnd() < goalChance ? (rnd() < 0.2 ? 2 : 1) : 0,
      a: rnd() < 0.18 ? 1 : 0,
      cs: (p.pos === 'GK' || p.pos === 'DF') && rnd() < 0.4 ? 1 : 0,
    };
  }
  s.matchStats = { demo1: { label: 'Demo — fictional Matchday 1', date: '2026-06-12T20:00Z', final: true, playerStats: ps } };
  s.lastSync = new Date().toISOString();
  return s;
}
const INVITE_TEXT = `⚽ THE LEAGUE — WORLD CUNT 2026 ⚽
A Calciopoli Production

1. Open: https://benmpolak.github.io/calciopoli-wc26/
2. It'll ask who you are — pick your own name. No imposters, Moggi is watching.
3. Draft happens live in The Console — snake order, 15 players each, every player from all 48 World Cup squads.

Weekly starting XIs. Waiver swaps from the Trough (bottom of the table feeds first). Trades. Head-to-head every gameweek. Loser gets relegated to Serie B.

Rules are on the Rules tab. The phones are not tapped. Allegedly.`;

async function shareInvite() {
  if (navigator.share) {
    try { await navigator.share({ text: INVITE_TEXT }); return; } catch { /* cancelled */ }
  }
  try {
    await navigator.clipboard.writeText(INVITE_TEXT);
    toast('Invite copied — paste it into Calciopoli');
  } catch {
    prompt('Copy this and send it to the lads:', INVITE_TEXT);
  }
}

function enterDemo() {
  if (demoMode) return;
  demoBackup = state;
  demoMode = true;
  state = buildDemoState();
  render();
  toast('Demo mode — fake draft, fake results. Your real league is untouched.');
}
function exitDemo() {
  state = demoBackup || load() || freshState();
  demoMode = false;
  demoBackup = null;
  render();
}
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(LS_KEY));
    if (s && !s.lineups) { s.lineups = {}; s.transfers = []; } // migrate pre-lineup saves
    if (s && !s.waivers) s.waivers = {};
    if (s && s.settings.maxPerCountry == null) s.settings.maxPerCountry = 3;
    return s;
  } catch { return null; }
}

/* ---------------- helpers ---------------- */
const $ = sel => document.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const flagImg = (team, big = false) => {
  const t = TEAM_BY_NAME[team];
  return t ? `<img class="flag${big ? ' big' : ''}" loading="lazy" src="https://flagcdn.com/w40/${t.flag}.png" srcset="https://flagcdn.com/w80/${t.flag}.png 2x" alt="${esc(team)}" title="${esc(team)}">` : '';
};
function toast(msg) {
  const el = $('#toast') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'toast' }));
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2600);
}
function normName(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function nameTokens(s) { return new Set(normName(s).split(' ').filter(Boolean)); }
function managerName(mid) { return state.managers.find(m => m.id === mid)?.name || `Manager ${mid}`; }

/* ---------------- rosters (draft + transfers) ---------------- */
function squadAt(mid, gwIdx) {
  const ids = new Set(state.draft.picks.filter(p => p.managerId === mid).map(p => p.playerId));
  for (const t of state.transfers) {
    if (t.managerId !== mid || t.gw > gwIdx) continue;
    ids.delete(t.outId);
    ids.add(t.inId);
  }
  return [...ids].map(id => PLAYER_BY_ID[id]);
}
function managerSquad(mid) { return squadAt(mid, currentGwIndex()); }
function posCount(mid) {
  const c = { GK: 0, DF: 0, MF: 0, FW: 0 };
  managerSquad(mid).forEach(p => c[p.pos]++);
  return c;
}
function ownedIdsAt(gwIdx) {
  const ids = new Set();
  for (const m of state.managers) for (const p of squadAt(m.id, gwIdx)) ids.add(p.id);
  return ids;
}
function countryCount(squad, team) { return squad.filter(p => p.team === team).length; }

/* ---------------- gameweek waiver draft ---------------- */
function waiverOrder(gwIdx) {
  const anyFinal = GAMEWEEKS.some((g, i) => i < gwIdx && gwStatus(i) === 'final');
  const base = anyFinal ? h2hStandings().map(r => r.id) : [...state.draft.order];
  return [...base].reverse(); // bottom feeds first
}
function waiverState(gwIdx) {
  const actions = state.waivers?.[gwIdx]?.actions || [];
  const order = waiverOrder(gwIdx);
  return { order, actions, turnMid: order[actions.length] ?? null, complete: actions.length >= order.length };
}

/* ---------------- draft logic ---------------- */
function totalPicks() { return state.managers.length * state.settings.squadSize; }
function pickNo() { return state.draft.picks.length; }
function currentManagerId() {
  const n = pickNo(), m = state.managers.length;
  if (n >= totalPicks()) return null;
  const round = Math.floor(n / m), idx = n % m;
  const order = state.draft.order;
  return (round % 2 === 0) ? order[idx] : order[m - 1 - idx];
}
function canPick(mid, player) {
  const q = state.settings.quotas;
  if (posCount(mid)[player.pos] >= q[player.pos]) return false;
  return countryCount(managerSquad(mid), player.team) < state.settings.maxPerCountry;
}
function draftedIds() { return new Set(state.draft.picks.map(p => p.playerId)); }

function makePick(playerId) {
  const mid = currentManagerId();
  if (mid == null) return;
  if (!canActFor(mid)) { toast(`It's ${managerName(mid)}'s pick — Moggi is watching you`); return; }
  const player = PLAYER_BY_ID[playerId];
  if (!canPick(mid, player)) { toast(`${managerName(mid)} already has the max ${player.pos}s (or country limit)`); return; }
  const rec = { managerId: mid, playerId, n: pickNo() + 1 };
  const finishPick = total => {
    if (total >= totalPicks()) {
      state.phase = 'season';
      if (whoami === mid) state.view = 'team';
      pushShared('phase', 'season');
      toast('Draft complete. Moggi has filed the paperwork. Game on.');
    } else if (Math.random() < 0.3) {
      toast(moggiSays());
    }
    save(); render();
  };
  if (netOn()) {
    const expected = pickNo();
    window.WCSync.txn('draft/picks', cur => {
      const arr = toArr(cur);
      if (arr.length !== expected) return; // someone got there first — abort
      arr.push(rec);
      return arr;
    }).then(res => {
      if (!res.committed) { toast('Pick clashed — the board moved on'); return; }
      state.draft.picks = toArr(res.snapshot.val());
      finishPick(state.draft.picks.length);
    }).catch(e => { console.warn(e); toast('Pick failed to send — check connection'); });
  } else {
    state.draft.picks.push(rec);
    finishPick(state.draft.picks.length);
  }
}
function autoPick() {
  const mid = currentManagerId();
  if (mid == null) return;
  const taken = draftedIds();
  const best = PLAYERS.filter(p => !taken.has(p.id) && canPick(mid, p))
    .sort((a, b) => (b.goals * 3 + b.caps) - (a.goals * 3 + a.caps))[0];
  if (best) makePick(best.id);
}

/* ---------------- lineups ---------------- */
function autoXI(squad) {
  const by = pos => squad.filter(p => p.pos === pos).sort((a, b) => (b.goals * 3 + b.caps) - (a.goals * 3 + a.caps));
  const xi = [...by('GK').slice(0, 1), ...by('DF').slice(0, 4), ...by('MF').slice(0, 4), ...by('FW').slice(0, 2)];
  return xi.map(p => p.id);
}
function lineupFor(mid, gwIdx) {
  const stored = state.lineups[mid] || {};
  if (stored[gwIdx]) return stored[gwIdx];
  const squadIds = new Set(squadAt(mid, gwIdx).map(p => p.id));
  for (let j = gwIdx - 1; j >= 0; j--) {
    if (stored[j] && stored[j].every(id => squadIds.has(id))) return stored[j];
  }
  return autoXI(squadAt(mid, gwIdx));
}
function xiCounts(pids) {
  const c = { GK: 0, DF: 0, MF: 0, FW: 0 };
  pids.forEach(id => c[PLAYER_BY_ID[id].pos]++);
  return c;
}
function xiValid(pids) {
  if (pids.length !== XI_RULES.size) return false;
  const c = xiCounts(pids);
  return ['GK', 'DF', 'MF', 'FW'].every(pos => c[pos] >= XI_RULES[pos][0] && c[pos] <= XI_RULES[pos][1]);
}

/* ---------------- scoring ---------------- */
function statPoints(player, s) {
  const sc = state.settings.scoring;
  const goalPts = { GK: sc.goalGK, DF: sc.goalDF, MF: sc.goalMF, FW: sc.goalFW }[player.pos] ?? sc.goalFW;
  let pts = (s.st || 0) * sc.start + (s.sub || 0) * sc.sub + (s.g || 0) * goalPts + (s.a || 0) * sc.assist;
  if (player.pos === 'GK' || player.pos === 'DF') pts += (s.cs || 0) * sc.cleanSheet;
  return pts;
}
function gwPlayerPoints(pid, gwIdx) {
  const p = PLAYER_BY_ID[pid];
  let pts = 0;
  for (const ev of Object.values(state.matchStats)) {
    if (!inGw(ev.date, gwIdx)) continue;
    const s = ev.playerStats?.[pid];
    if (s) pts += statPoints(p, s);
  }
  return pts;
}
// did the player get on the pitch at all this gameweek?
function appearedInGw(pid, gwIdx) {
  for (const ev of Object.values(state.matchStats)) {
    if (!inGw(ev.date, gwIdx)) continue;
    const s = ev.playerStats?.[pid];
    if (s && (s.st || s.sub)) return true;
  }
  return false;
}
// auto-subs: starters who never played are replaced by bench players who did,
// best-rated first, keeping the XI shape legal
function effectiveXI(mid, gwIdx) {
  const xi = [...lineupFor(mid, gwIdx)];
  const anySynced = Object.values(state.matchStats).some(ev => inGw(ev.date, gwIdx));
  if (!anySynced) return { xi, subs: [] };
  const squad = squadAt(mid, gwIdx);
  const bench = squad.filter(p => !xi.includes(p.id) && appearedInGw(p.id, gwIdx))
    .sort((a, b) => (b.goals * 3 + b.caps) - (a.goals * 3 + a.caps));
  const subs = [];
  for (const pid of [...xi]) {
    if (appearedInGw(pid, gwIdx)) continue;
    const idx = xi.indexOf(pid);
    for (const cand of bench) {
      if (xi.includes(cand.id)) continue;
      const trial = [...xi];
      trial[idx] = cand.id;
      if (xiValid(trial)) {
        xi[idx] = cand.id;
        subs.push({ out: pid, in: cand.id });
        break;
      }
    }
  }
  return { xi, subs };
}
function gwManagerPoints(mid, gwIdx) {
  return effectiveXI(mid, gwIdx).xi.reduce((t, pid) => t + gwPlayerPoints(pid, gwIdx), 0);
}
function managerPoints(mid) {
  let pts = 0;
  for (let i = 0; i < GAMEWEEKS.length; i++) {
    pts += gwManagerPoints(mid, i); // zero unless results exist in that window
  }
  const squadIds = new Set(managerSquad(mid).map(p => p.id));
  for (const [pid, adj] of Object.entries(state.adjustments)) {
    if (adj && squadIds.has(+pid)) pts += adj;
  }
  return pts;
}
// points a player has banked for this manager (only weeks he was in the XI)
function contributedPoints(mid, pid) {
  let pts = 0;
  for (let i = 0; i < GAMEWEEKS.length; i++) {
    if (effectiveXI(mid, i).xi.includes(pid)) pts += gwPlayerPoints(pid, i);
  }
  return pts + (state.adjustments[pid] || 0);
}
// raw all-tournament breakdown for tooltips / top players
function playerPoints(pid) {
  const p = PLAYER_BY_ID[pid];
  const sc = state.settings.scoring;
  let pts = 0;
  const lines = [];
  const agg = { st: 0, sub: 0, g: 0, a: 0, cs: 0 };
  for (const ev of Object.values(state.matchStats)) {
    const s = ev.playerStats?.[pid];
    if (!s) continue;
    for (const k of Object.keys(agg)) agg[k] += (s[k] || 0);
  }
  const goalPts = { GK: sc.goalGK, DF: sc.goalDF, MF: sc.goalMF, FW: sc.goalFW }[p.pos] ?? sc.goalFW;
  const add = (n, label, v) => { if (n && v) { pts += n * v; lines.push(`${label} ${n}× = ${n * v}`); } };
  add(agg.st, 'Starts', sc.start);
  add(agg.sub, 'Sub apps', sc.sub);
  add(agg.g, 'Goals', goalPts);
  add(agg.a, 'Assists', sc.assist);
  if (p.pos === 'GK' || p.pos === 'DF') add(agg.cs, 'Clean sheets', sc.cleanSheet);
  return { pts, agg, lines };
}

/* ---------------- head-to-head ---------------- */
function gwStatus(i) {
  const synced = Object.values(state.matchStats).some(ev => inGw(ev.date, i));
  if (gwIsOver(i) && synced) return 'final';
  if (synced) return 'live';
  if (gwHasStarted(i)) return 'underway';
  return 'upcoming';
}
function h2hStandings() {
  const rows = Object.fromEntries(state.managers.map(m => [m.id, { id: m.id, name: m.name, p: 0, w: 0, d: 0, l: 0, pts: 0 }]));
  for (let i = 0; i < GAMEWEEKS.length; i++) {
    if (gwStatus(i) !== 'final') continue;
    for (const [a, b] of pairingsFor(i)) {
      const pa = gwManagerPoints(a, i), pb = gwManagerPoints(b, i);
      rows[a].p++; rows[b].p++;
      if (pa > pb) { rows[a].w++; rows[a].pts += 3; rows[b].l++; }
      else if (pb > pa) { rows[b].w++; rows[b].pts += 3; rows[a].l++; }
      else { rows[a].d++; rows[b].d++; rows[a].pts++; rows[b].pts++; }
    }
  }
  return Object.values(rows).sort((x, y) => y.pts - x.pts || managerPoints(y.id) - managerPoints(x.id));
}

/* ---------------- ESPN sync ---------------- */
function teamFromEspn(name) {
  const n = normName(name);
  for (const t of TEAMS) if (t.aliases.some(a => normName(a) === n) || normName(t.name) === n) return t.name;
  return null;
}
function matchPlayer(espnName, teamName) {
  const candidates = PLAYERS.filter(p => p.team === teamName);
  const eTok = nameTokens(espnName);
  let best = null, bestScore = 0;
  for (const p of candidates) {
    const pTok = nameTokens(p.name);
    let overlap = 0;
    for (const t of eTok) if (pTok.has(t)) overlap++;
    const score = overlap / Math.max(1, Math.max(eTok.size, pTok.size));
    if (score > bestScore) { bestScore = score; best = p; }
  }
  if (bestScore >= 0.5) return best;
  const eArr = [...eTok];
  const eLast = eArr[eArr.length - 1];
  const surnameHits = candidates.filter(p => { const a = [...nameTokens(p.name)]; return a[a.length - 1] === eLast; });
  if (surnameHits.length === 1) return surnameHits[0];
  return null;
}

let liveTimer = null;
function anyMatchLive() { return state.fixtures.some(f => f.state === 'in'); }

async function syncNow(manual = false) {
  if (demoMode) { if (manual) toast('Demo mode — the results are fictional, like Moggi’s innocence'); return; }
  const btn = $('#syncBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Tapping…'; }
  try {
    const res = await fetch(`${ESPN_BASE}/scoreboard?dates=${TOURN_RANGE}&limit=400`);
    const data = await res.json();
    const events = data.events || [];
    state.fixtures = events.map(e => {
      const comp = e.competitions?.[0] || {};
      const home = (comp.competitors || []).find(c => c.homeAway === 'home') || {};
      const away = (comp.competitors || []).find(c => c.homeAway === 'away') || {};
      return {
        id: e.id, date: e.date, name: e.name,
        home: home.team?.displayName || '?', away: away.team?.displayName || '?',
        hs: home.score, as: away.score,
        state: e.status?.type?.state || 'pre',
        detail: e.status?.type?.shortDetail || '',
        completed: !!e.status?.type?.completed,
      };
    }).sort((a, b) => a.date.localeCompare(b.date));

    // process finished matches once; reprocess live matches every sync
    const todo = state.fixtures.filter(f =>
      (f.completed && !state.matchStats[f.id]?.final) ||
      (f.state === 'in'));
    let processed = 0;
    for (const fx of todo) {
      try { await processMatch(fx); processed++; }
      catch (err) { console.warn('match parse failed', fx.id, err); }
    }
    state.lastSync = new Date().toISOString();
    save(); render();
    if (manual) toast(processed ? `Lines tapped — ${processed} match${processed > 1 ? 'es' : ''} scored` : 'Lines tapped — nothing new');
  } catch (err) {
    console.error(err);
    if (manual) toast('Sync failed — check connection');
  }
  const b2 = $('#syncBtn');
  if (b2) { b2.disabled = false; b2.textContent = '📞 Tap the lines'; }
  // keep tapping while matches are in play
  clearTimeout(liveTimer);
  if (anyMatchLive()) liveTimer = setTimeout(() => syncNow(false), 120000);
}

async function processMatch(fx) {
  const res = await fetch(`${ESPN_BASE}/summary?event=${fx.id}`);
  const data = await res.json();
  const rosters = data.rosters || [];
  if (!rosters.length) return;
  const playerStats = {};
  const label = `${fx.home} ${fx.hs}–${fx.as} ${fx.away}`;
  const scores = {};
  scores[fx.home] = { gf: +fx.hs || 0, ga: +fx.as || 0 };
  scores[fx.away] = { gf: +fx.as || 0, ga: +fx.hs || 0 };

  for (const side of rosters) {
    const espnTeamName = side.team?.displayName || '';
    const ourTeam = teamFromEspn(espnTeamName);
    if (!ourTeam) continue;
    const sc = scores[espnTeamName] || { gf: 0, ga: 0 };
    for (const entry of (side.roster || [])) {
      const stats = Object.fromEntries((entry.stats || []).map(s => [s.abbreviation, +s.value || 0]));
      const played = (stats.APP || 0) > 0 || entry.starter || entry.subbedIn;
      if (!played) continue;
      const espnId = entry.athlete?.id;
      const espnName = entry.athlete?.displayName || '';
      let player = espnId && state.playerMap[espnId] ? PLAYER_BY_ID[state.playerMap[espnId]] : null;
      if (!player) {
        player = matchPlayer(espnName, ourTeam);
        if (player && espnId) state.playerMap[espnId] = player.id;
      }
      if (!player) {
        const key = `${fx.id}:${espnId || espnName}`;
        if (!state.unmatched.some(u => u.key === key)) {
          state.unmatched.push({ key, eventId: fx.id, label, espnName, espnTeam: ourTeam, espnId });
        }
        continue;
      }
      playerStats[player.id] = {
        st: entry.starter ? 1 : 0,
        sub: entry.starter ? 0 : 1,
        g: stats.G || 0,
        a: stats.A || 0,
        cs: sc.ga === 0 ? 1 : 0,
      };
    }
  }
  state.matchStats[fx.id] = { label, date: fx.date, final: !!fx.completed, playerStats };
}

/* ---------------- views ---------------- */
const NAV_ITEMS = [
  ['draft', 'The Console'],
  ['team', 'My Team'],
  ['h2h', 'Head-to-Head'],
  ['table', 'League Table'],
  ['fixtures', 'Fixtures'],
  ['rules', 'Rules'],
  ['settings', 'Settings'],
];

function render() {
  // keep keyboard focus across re-renders (remote updates land mid-typing)
  const ae = document.activeElement;
  const focusId = ae && ae.id && (ae.tagName === 'INPUT' || ae.tagName === 'SELECT') ? ae.id : null;
  let caret = null;
  try { caret = focusId && ae.selectionStart != null ? ae.selectionStart : null; } catch { caret = null; }

  renderNav();
  renderSyncArea();
  let bar = $('#demoBar');
  if (demoMode && !bar) {
    bar = document.createElement('div');
    bar.id = 'demoBar';
    bar.className = 'demo-bar';
    bar.innerHTML = `<span class="rec"></span> DEMO — fake draft, fictional results. Your real league is untouched. <button class="btn small" id="demoExit">Exit demo</button>`;
    document.body.appendChild(bar);
    $('#demoExit').onclick = exitDemo;
  } else if (!demoMode && bar) {
    bar.remove();
  }
  const main = $('#main');
  if (state.phase === 'setup') { main.innerHTML = viewSetup(); bindSetup(); return; }
  switch (state.view) {
    case 'draft': main.innerHTML = viewDraft(); bindDraft(); break;
    case 'team': main.innerHTML = viewTeam(); bindTeam(); break;
    case 'h2h': main.innerHTML = viewH2H(); break;
    case 'table': main.innerHTML = viewTable(); bindTable(); break;
    case 'fixtures': main.innerHTML = viewFixtures(); break;
    case 'rules': main.innerHTML = viewRules(); break;
    case 'settings': main.innerHTML = viewSettings(); bindSettings(); break;
    default: state.view = 'draft'; render();
  }
  renderIdentity();
  if (focusId) {
    const el = document.getElementById(focusId);
    if (el) {
      el.focus();
      try { if (caret != null) el.setSelectionRange(caret, caret); } catch { /* selects */ }
    }
  }
}

function renderIdentity() {
  let ov = $('#whoOverlay');
  const needed = netOn() && state.phase !== 'setup' && !whoami;
  if (!needed) { ov?.remove(); return; }
  if (ov) return;
  ov = document.createElement('div');
  ov.id = 'whoOverlay';
  ov.className = 'overlay';
  ov.innerHTML = `<div class="card" style="max-width:420px;width:92%">
    <h2>Who are you?</h2>
    <p class="muted" style="font-size:13px;margin-bottom:14px">Actions from this device count for the manager you pick. Choose honestly — Moggi has your number. Literally.</p>
    ${state.managers.map((m, i) => `<button class="btn ghost" data-who="${m.id}" style="width:100%;margin-bottom:8px;text-align:left">${esc(m.name)}${i === 0 ? ' <span class="tag">commissioner</span>' : ''}</button>`).join('')}
    <button class="btn ghost" data-who="-1" style="width:100%;opacity:.7">Just watching</button>
  </div>`;
  document.body.appendChild(ov);
  ov.querySelectorAll('[data-who]').forEach(b => b.onclick = () => {
    whoami = +b.dataset.who;
    localStorage.setItem(WHO_KEY, whoami);
    render();
    toast(whoami === -1 ? 'Spectator mode. Probably a journalist.' : `Welcome, ${managerName(whoami)}. This conversation is being recorded.`);
  });
}

function renderNav() {
  const nav = $('#nav');
  if (state.phase === 'setup') { nav.innerHTML = ''; return; }
  nav.innerHTML = NAV_ITEMS.map(([id, label]) =>
    `<button data-view="${id}" class="${state.view === id ? 'active' : ''}">${label}</button>`).join('');
  nav.querySelectorAll('button').forEach(b => b.onclick = () => { state.view = b.dataset.view; save(); render(); });
}

function renderSyncArea() {
  const el = $('#syncArea');
  if (!el || state.phase === 'setup') { if (el) el.innerHTML = ''; return; }
  const bits = [];
  if (anyMatchLive()) bits.push('<span class="live-pill"><span class="rec"></span>LIVE</span>');
  if (syncOn()) {
    bits.push(`<span class="conn ${syncConnected ? 'up' : ''}" title="${syncConnected ? 'Live sync: connected' : 'Live sync: reconnecting — changes will queue'}">&#9679;</span>`);
    const who = whoami === -1 ? 'Spectating' : (whoami ? esc(managerName(whoami)) : 'Who are you?');
    bits.push(`<button class="tag" id="whoBtn" style="cursor:pointer" title="Switch who this device acts as">${who}</button>`);
  }
  if (state.phase === 'season') {
    const last = state.lastSync ? new Date(state.lastSync).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'never';
    bits.push(`<span>Last intercept: ${last}</span><button id="syncBtn" class="btn small">&#128222; Tap the lines</button>`);
  }
  el.innerHTML = bits.join('');
  const wb = $('#whoBtn');
  if (wb) wb.onclick = () => { whoami = null; localStorage.removeItem(WHO_KEY); render(); };
  const sb = $('#syncBtn');
  if (sb) sb.onclick = () => syncNow(true);
}

/* ----- setup ----- */
function viewSetup() {
  const m = state.managers;
  const q = state.settings.quotas;
  return `
  <div class="setup-wrap">
    <div class="setup-hero">
      <h2>&#9917; The League &mdash; World Cunt 2026</h2>
      <p>Four managers. One snake draft. Every player from all 48 final squads.<br>No phone taps. Allegedly.</p>
    </div>
    <div class="card">
      <h2>Managers</h2>
      ${m.map((mg, i) => `
        <div class="mgr-row">
          <span class="mgr-num">${i + 1}</span>
          <input type="text" maxlength="20" placeholder="Manager ${i + 1} name" data-mgr="${mg.id}" value="${esc(mg.name)}">
        </div>`).join('')}
    </div>
    <div class="card">
      <h2>Squad rules</h2>
      <div class="quota-grid">
        ${['GK', 'DF', 'MF', 'FW'].map(pos => `
          <div><label>${POS_LABEL[pos]}</label>
          <input type="number" min="0" max="11" data-quota="${pos}" value="${q[pos]}"></div>`).join('')}
      </div>
      <div style="margin-top:12px;display:flex;align-items:center;gap:10px">
        <label style="font-size:12px;color:var(--muted);font-weight:700">MAX PLAYERS PER COUNTRY</label>
        <input type="number" min="1" max="26" id="maxCountry" value="${state.settings.maxPerCountry}" style="width:70px">
      </div>
      <div class="setup-total" id="setupTotal"></div>
    </div>
    <button class="btn" id="startDraft" style="padding:14px;font-size:16px">Randomise order &amp; start the draft</button>
    <button class="btn ghost" id="inviteBtn">&#128172; Invite the lads (WhatsApp-ready)</button>
    <button class="btn ghost" id="demoBtn">Have a look around first — demo a finished season</button>
  </div>`;
}
function bindSetup() {
  const updateTotal = () => {
    const q = state.settings.quotas;
    const total = q.GK + q.DF + q.MF + q.FW;
    state.settings.squadSize = total;
    $('#setupTotal').innerHTML = `Squad size: <b>${total}</b> each &middot; <b>${total * state.managers.length}</b> of ${PLAYERS.length} players drafted &middot; starting XI picked each gameweek &middot; weekly waiver draft, bottom first`;
  };
  document.querySelectorAll('[data-mgr]').forEach(inp => inp.oninput = () => {
    state.managers.find(m => m.id === +inp.dataset.mgr).name = inp.value;
  });
  document.querySelectorAll('[data-quota]').forEach(inp => inp.oninput = () => {
    state.settings.quotas[inp.dataset.quota] = Math.max(0, +inp.value || 0);
    updateTotal();
  });
  $('#maxCountry').oninput = e => { state.settings.maxPerCountry = Math.max(1, +e.target.value || 3); };
  updateTotal();
  $('#inviteBtn').onclick = shareInvite;
  $('#demoBtn').onclick = enterDemo;
  $('#startDraft').onclick = () => {
    state.managers.forEach((m, i) => { if (!m.name.trim()) m.name = `Manager ${i + 1}`; });
    if (state.settings.squadSize < 11) { toast('Squads need at least 11 for a starting XI'); return; }
    state.draft.order = state.managers.map(m => m.id).sort(() => Math.random() - 0.5);
    state.phase = 'draft';
    state.view = 'draft';
    publishAll();
    save(); render();
    toast(`Draft order: ${state.draft.order.map(managerName).join(' → ')}`);
  };
}

/* ----- the console (draft) ----- */
let poolFilter = { q: '', team: '', pos: '', sort: 'rating', limit: 60 };

function viewDraft() {
  if (state.phase === 'season') return viewDraftRecap();
  const mid = currentManagerId();
  const n = pickNo();
  const round = Math.floor(n / state.managers.length) + 1;
  const taken = draftedIds();
  const teamsOpts = TEAMS.map(t => `<option value="${esc(t.name)}" ${poolFilter.team === t.name ? 'selected' : ''}>${esc(t.name)}</option>`).join('');

  return `
  <div class="on-clock">
    <div>
      <div class="who">${esc(managerName(mid))} — you're on the clock</div>
      <div class="pick-meta">Pick ${n + 1} of ${totalPicks()} &middot; Round ${round} of ${state.settings.squadSize}</div>
      <div class="intercept"><span class="rec"></span>LIVE INTERCEPT &mdash; &ldquo;${esc(interceptFor(n, managerName(mid)))}&rdquo;</div>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn ghost small" id="undoPick" ${n === 0 ? 'disabled' : ''}>Undo last</button>
      <button class="btn ghost small" id="autoPick" title="Luciano makes a call. Untraceable, naturally.">&#128222; Ask Moggi</button>
    </div>
  </div>
  <div class="order-strip">${draftOrderStrip()}</div>
  <div class="draft-layout">
    <div class="card">
      <div class="pool-controls">
        <input type="text" id="poolQ" placeholder="Search ${PLAYERS.length - taken.size} available players…" value="${esc(poolFilter.q)}">
        <select id="poolTeam"><option value="">All nations</option>${teamsOpts}</select>
        <select id="poolPos">
          <option value="">All positions</option>
          ${['GK', 'DF', 'MF', 'FW'].map(p => `<option ${poolFilter.pos === p ? 'selected' : ''}>${p}</option>`).join('')}
        </select>
      </div>
      ${poolTable()}
    </div>
    <div class="draft-side">
      <div class="card side-squad">
        <h2>${esc(managerName(mid))}'s squad</h2>
        <div class="quota-bar">${quotaPills(mid)}</div>
        ${managerSquad(mid).sort((a, b) => POS_ORDER[a.pos] - POS_ORDER[b.pos]).map(p => `
          <div class="srow"><span class="pos-badge pos-${p.pos}">${p.pos}</span>${flagImg(p.team)}<span>${esc(p.name)}</span></div>
        `).join('') || '<span class="muted">No picks yet</span>'}
      </div>
      <div class="card">
        <h2>Pick history</h2>
        <div class="pick-log">
          ${[...state.draft.picks].reverse().slice(0, 40).map(pk => {
            const p = PLAYER_BY_ID[pk.playerId];
            return `<div class="lrow"><span class="muted">#${pk.n}</span><b>${esc(managerName(pk.managerId))}</b> ${flagImg(p.team)} ${esc(p.name)}</div>`;
          }).join('') || '<span class="muted">First pick incoming…</span>'}
        </div>
      </div>
    </div>
  </div>`;
}

function draftOrderStrip() {
  const m = state.managers.length;
  const n = pickNo();
  const round = Math.floor(n / m);
  const order = state.draft.order;
  const seq = (round % 2 === 0) ? order : [...order].reverse();
  return seq.map((mid, i) => {
    const globalIdx = round * m + i;
    const cls = globalIdx < n ? 'done' : (globalIdx === n ? 'now' : '');
    return `<span class="order-chip ${cls}">${esc(managerName(mid))}</span>`;
  }).join('<span class="muted" style="align-self:center">›</span>') +
    `<span class="tag" style="margin-left:10px">Round ${round + 1}${round % 2 ? ' (reversed)' : ''}</span>`;
}

function quotaPills(mid) {
  const q = state.settings.quotas, c = posCount(mid);
  return ['GK', 'DF', 'MF', 'FW'].map(p =>
    `<span class="quota-pill ${c[p] >= q[p] ? 'full' : ''}">${p} ${c[p]}/${q[p]}</span>`).join('');
}

function poolTable() {
  const taken = draftedIds();
  const mid = currentManagerId();
  let rows = PLAYERS.filter(p => !taken.has(p.id));
  if (poolFilter.q) {
    const q = normName(poolFilter.q);
    rows = rows.filter(p => normName(p.name).includes(q) || normName(p.team).includes(q) || normName(p.club).includes(q));
  }
  if (poolFilter.team) rows = rows.filter(p => p.team === poolFilter.team);
  if (poolFilter.pos) rows = rows.filter(p => p.pos === poolFilter.pos);
  const s = poolFilter.sort;
  rows.sort((a, b) => s === 'name' ? a.name.localeCompare(b.name)
    : s === 'age' ? (a.age || 99) - (b.age || 99)
    : s === 'goals' ? b.goals - a.goals
    : s === 'caps' ? b.caps - a.caps
    : rating(b) - rating(a));
  const total = rows.length;
  rows = rows.slice(0, poolFilter.limit);
  return `
  <table class="pool-table">
    <thead><tr>
      <th data-sort="name">Player</th><th>Nation</th><th>Pos</th>
      <th class="num" data-sort="age">Age</th>
      <th class="num" data-sort="caps">Caps ${s === 'caps' ? '▾' : ''}</th>
      <th class="num" data-sort="goals">Goals ${s === 'goals' ? '▾' : ''}</th>
      <th class="num" data-sort="rating" title="Moggi's form guide: goals ×3 + caps">Rating ${s === 'rating' ? '▾' : ''}</th><th></th>
    </tr></thead>
    <tbody>
      ${rows.map(p => `
      <tr>
        <td><div class="pcell">${flagImg(p.team)}<div><div class="pname">${esc(p.name)}</div><div class="pclub">${esc(p.club)}</div></div></div></td>
        <td class="muted">${esc(p.team)}</td>
        <td><span class="pos-badge pos-${p.pos}">${p.pos}</span></td>
        <td class="num muted">${p.age ?? ''}</td>
        <td class="num">${p.caps}</td>
        <td class="num">${p.goals}</td>
        <td class="num gold">${rating(p)}</td>
        <td><button class="btn small" data-pick="${p.id}" ${canPick(mid, p) && canActFor(mid) ? '' : `disabled title="${canActFor(mid) ? 'Position quota or country limit hit' : `${esc(managerName(mid))} is on the clock, not you`}"`}>Draft</button></td>
      </tr>`).join('')}
    </tbody>
  </table>
  ${total > poolFilter.limit ? `<div class="show-more"><button class="btn ghost small" id="showMore">Show more (${total - poolFilter.limit} hidden)</button></div>` : ''}`;
}

function bindDraft() {
  if (state.phase === 'season') return;
  const q = $('#poolQ');
  q.oninput = () => { poolFilter.q = q.value; poolFilter.limit = 60; refreshPool(); };
  $('#poolTeam').onchange = e => { poolFilter.team = e.target.value; poolFilter.limit = 60; refreshPool(); };
  $('#poolPos').onchange = e => { poolFilter.pos = e.target.value; poolFilter.limit = 60; refreshPool(); };
  bindPoolTable();
  $('#undoPick').onclick = () => {
    if (netOn() && !isCommissioner()) { toast('Only the commissioner can undo a pick'); return; }
    if (netOn()) {
      window.WCSync.txn('draft/picks', cur => { const a = toArr(cur); a.pop(); return a; })
        .then(res => { state.draft.picks = toArr(res.snapshot.val()); save(); render(); });
    } else {
      state.draft.picks.pop(); save(); render();
    }
  };
  $('#autoPick').onclick = autoPick;
}
function refreshPool() {
  const card = document.querySelector('.draft-layout .card');
  card.querySelector('.pool-table')?.remove();
  card.querySelector('.show-more')?.remove();
  card.insertAdjacentHTML('beforeend', poolTable());
  bindPoolTable();
  const q = $('#poolQ'); q.focus();
  q.setSelectionRange(q.value.length, q.value.length);
}
function bindPoolTable() {
  document.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => makePick(+b.dataset.pick));
  document.querySelectorAll('[data-sort]').forEach(th => th.onclick = () => { poolFilter.sort = th.dataset.sort; refreshPool(); });
  const sm = $('#showMore');
  if (sm) sm.onclick = () => { poolFilter.limit += 100; refreshPool(); };
}

function viewDraftRecap() {
  return `<div class="card"><h2>The Console &mdash; draft archive</h2>
    <p class="muted" style="margin-bottom:12px">All ${totalPicks()} picks are in. The recordings have been sealed.</p>
    <div class="pick-log" style="max-height:none">
    ${state.draft.picks.map(pk => {
      const p = PLAYER_BY_ID[pk.playerId];
      return `<div class="lrow"><span class="muted" style="width:38px">#${pk.n}</span><b style="width:130px">${esc(managerName(pk.managerId))}</b>${flagImg(p.team)} ${esc(p.name)} <span class="muted">· ${p.pos} · ${esc(p.team)}</span></div>`;
    }).join('')}
    </div></div>`;
}

/* ----- my team (lineups + transfers) ----- */
let teamView = { mid: null, gw: null, transferOut: null };

function viewTeam() {
  if (teamView.mid == null) teamView.mid = state.managers[0].id;
  if (teamView.gw == null) teamView.gw = currentGwIndex();
  const mid = teamView.mid, gw = teamView.gw;
  const squad = squadAt(mid, gw).sort((a, b) => POS_ORDER[a.pos] - POS_ORDER[b.pos] || b.caps - a.caps);
  const xi = lineupFor(mid, gw);
  const counts = xiCounts(xi);
  const valid = xiValid(xi);
  const locked = gwIsOver(gw);
  const cur = currentGwIndex();
  const ownedNow = ownedIdsAt(cur);
  const wv = waiverState(cur);

  const countsBar = ['GK', 'DF', 'MF', 'FW'].map(pos => {
    const [lo, hi] = XI_RULES[pos];
    const ok = counts[pos] >= lo && counts[pos] <= hi;
    return `<span class="quota-pill ${ok ? 'full' : 'bad'}">${pos} ${counts[pos]} <span class="muted">(${lo}–${hi})</span></span>`;
  }).join('') + `<span class="quota-pill ${xi.length === 11 ? 'full' : 'bad'}">XI ${xi.length}/11</span>`;

  return `
  <div class="team-controls card">
    <select id="teamMgr">${state.managers.map(m => `<option value="${m.id}" ${m.id === mid ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>
    <select id="teamGw">${GAMEWEEKS.map((g, i) => `<option value="${i}" ${i === gw ? 'selected' : ''}>GW${g.n} — ${g.label}${i === cur ? ' (current)' : ''}</option>`).join('')}</select>
    <span class="tag">${locked ? 'Gameweek finished — locked' : (gwHasStarted(gw) ? 'Gameweek underway' : 'Lineup open')}</span>
    <span class="tag">GW points: <b class="gold">&nbsp;${gwManagerPoints(mid, gw)}</b></span>
  </div>
  <div class="draft-layout">
    <div class="card">
      <h2>Starting XI — GW${GAMEWEEKS[gw].n} <span class="muted" style="font-weight:400">(tap to swap)</span></h2>
      <div class="quota-bar">${countsBar}</div>
      ${!valid ? '<p class="warn">Invalid XI — fix the highlighted limits. Scoring uses whoever is listed, but sort it out before kickoff.</p>' : ''}
      ${['GK', 'DF', 'MF', 'FW'].map(pos => `
        <h3>${POS_LABEL[pos]}</h3>
        ${squad.filter(p => p.pos === pos).map(p => {
          const starting = xi.includes(p.id);
          const pts = gwPlayerPoints(p.id, gw);
          return `<div class="squad-row lineup-row ${starting ? 'starting' : 'benched'}" data-toggle="${p.id}" ${locked ? '' : 'style="cursor:pointer"'}>
            <span class="pos-badge pos-${p.pos}">${p.pos}</span>${flagImg(p.team)}
            <span>${esc(p.name)}</span>
            <span class="muted" style="font-size:11.5px">${esc(p.team)}</span>
            <span class="sp-pts ${pts > 0 ? 'gold' : 'muted'}">${pts}</span>
            <span class="xi-chip">${starting ? 'XI' : 'bench'}</span>
          </div>`;
        }).join('')}`).join('')}
    </div>
    <div class="draft-side">
      <div class="card">
        <h2>GW${GAMEWEEKS[cur].n} Waiver Draft</h2>
        <p class="muted" style="font-size:12px;margin-bottom:10px">One swap each per gameweek from the Trough. Bottom of the table feeds first.</p>
        <div class="order-strip" style="margin-bottom:10px">
          ${wv.order.map((wmid, i) => {
            const cls = i < wv.actions.length ? 'done' : (wmid === wv.turnMid ? 'now' : '');
            return `<span class="order-chip ${cls}">${esc(managerName(wmid))}</span>`;
          }).join('<span class="muted" style="align-self:center">›</span>')}
        </div>
        ${wv.complete ? `<p class="muted" style="font-size:12.5px">Waiver round complete. The Trough reopens next gameweek.</p>`
        : !canActFor(wv.turnMid) ? `<p class="muted" style="font-size:12.5px"><b style="color:var(--text)">${esc(managerName(wv.turnMid))}</b> is at the Trough. Lean on them in the group chat.</p>` : `
        <p style="font-size:13px;margin-bottom:8px"><b>${esc(managerName(wv.turnMid))}</b> is at the Trough</p>
        <select id="trOut" style="width:100%;margin-bottom:8px">
          <option value="">Player out…</option>
          ${squadAt(wv.turnMid, cur).sort((a, b) => POS_ORDER[a.pos] - POS_ORDER[b.pos]).map(p => `<option value="${p.id}" ${teamView.transferOut === p.id ? 'selected' : ''}>${p.pos} — ${esc(p.name)} (${esc(p.team)})</option>`).join('')}
        </select>
        <input type="text" id="trSearch" placeholder="Search the Trough — ${PLAYERS.length - ownedNow.size} players sniffing about…" style="width:100%;margin-bottom:8px">
        <div id="trResults" class="pick-log"></div>
        <button class="btn ghost small" id="trPass" style="margin-top:8px">Pass — nothing in the Trough for me</button>`}
        <h3 style="margin-top:16px">Transfer log</h3>
        ${state.transfers.filter(t => t.managerId === mid).map(t =>
          `<div class="lrow" style="font-size:12.5px;padding:3px 0"><span class="muted">GW${GAMEWEEKS[t.gw].n}${t.trade ? ' ↔' : ''}</span> ${esc(PLAYER_BY_ID[t.outId].name)} <span class="muted">→</span> <b>${esc(PLAYER_BY_ID[t.inId].name)}</b></div>`).join('') || '<span class="muted" style="font-size:12.5px">None yet.</span>'}
      </div>
      <div class="card">
        <h2>Trade desk</h2>
        <p class="muted" style="font-size:12px;margin-bottom:10px">Agreed in the group? Swap one player between two squads. Doesn't use a waiver turn.</p>
        <select id="tradeWith" style="width:100%;margin-bottom:8px">
          <option value="">Trade ${esc(managerName(mid))} with…</option>
          ${state.managers.filter(m => m.id !== mid).map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}
        </select>
        <div id="tradePickers"></div>
      </div>
      <div class="card">
        <h2>Gameweek points</h2>
        ${GAMEWEEKS.map((g, i) => {
          const st = gwStatus(i);
          if (st === 'upcoming') return '';
          return `<div class="lrow" style="justify-content:space-between"><span>GW${g.n} ${g.label} ${st !== 'final' ? '<span class="rec" style="display:inline-block"></span>' : ''}</span><b>${gwManagerPoints(mid, i)}</b></div>`;
        }).join('') || '<span class="muted">Nothing played yet.</span>'}
      </div>
    </div>
  </div>`;
}

function bindTeam() {
  $('#teamMgr').onchange = e => { teamView.mid = +e.target.value; teamView.transferOut = null; render(); };
  $('#teamGw').onchange = e => { teamView.gw = +e.target.value; render(); };
  const gw = teamView.gw, mid = teamView.mid;
  if (!gwIsOver(gw)) {
    document.querySelectorAll('[data-toggle]').forEach(row => row.onclick = () => {
      if (!canActFor(mid)) { toast(`That's ${managerName(mid)}'s team, not yours`); return; }
      const pid = +row.dataset.toggle;
      const xi = [...lineupFor(mid, gw)];
      const i = xi.indexOf(pid);
      if (i >= 0) xi.splice(i, 1);
      else {
        if (xi.length >= 11) { toast('XI is full — bench someone first'); return; }
        xi.push(pid);
      }
      (state.lineups[mid] = state.lineups[mid] || {})[gw] = xi;
      pushShared(`lineups/${mid}/${gw}`, xi);
      save(); render();
    });
  }
  // --- waiver draft ---
  const out = $('#trOut'), search = $('#trSearch'), results = $('#trResults'), pass = $('#trPass');
  if (out) {
    const cur = currentGwIndex();
    const wv = waiverState(cur);
    const wmid = wv.turnMid;
    out.onchange = () => { teamView.transferOut = +out.value || null; renderTrResults(); };
    search.oninput = renderTrResults;
    pass.onclick = () => {
      if (!canActFor(wmid)) { toast(`It's ${managerName(wmid)}'s turn at the Trough`); return; }
      (state.waivers[cur] = state.waivers[cur] || { actions: [] }).actions.push({ mid: wmid, pass: true });
      pushShared(`waivers/${cur}/actions`, state.waivers[cur].actions);
      save(); render();
      toast(`${managerName(wmid)} passes. The Trough remains untroubled.`);
    };
    function renderTrResults() {
      const q = normName(search.value || '');
      if (!teamView.transferOut) { results.innerHTML = '<span class="muted" style="font-size:12.5px">Pick who goes out first, then raid the Trough.</span>'; return; }
      const owned = ownedIdsAt(cur);
      const outP = PLAYER_BY_ID[teamView.transferOut];
      const squadAfterOut = squadAt(wmid, cur).filter(p => p.id !== outP.id);
      let pool = PLAYERS.filter(p => !owned.has(p.id));
      if (q) pool = pool.filter(p => normName(p.name).includes(q) || normName(p.team).includes(q));
      pool.sort((a, b) => (b.goals * 3 + b.caps) - (a.goals * 3 + a.caps));
      results.innerHTML = pool.slice(0, 15).map(p => {
        const posOk = p.pos === outP.pos || posCount(wmid)[p.pos] < state.settings.quotas[p.pos] + (p.pos === outP.pos ? 1 : 0);
        const countryOk = countryCount(squadAfterOut, p.team) < state.settings.maxPerCountry;
        const ok = posOk && countryOk;
        return `<div class="lrow"><span class="pos-badge pos-${p.pos}">${p.pos}</span>${flagImg(p.team)} ${esc(p.name)} <span class="muted" style="font-size:11px">${esc(p.team)}</span>
         <button class="btn small" style="margin-left:auto" data-trin="${p.id}" ${ok ? '' : `disabled title="${countryOk ? 'Position quota full' : 'Country limit reached'}"`}>Sign</button></div>`;
      }).join('') || '<span class="muted">The Trough is empty. Somehow.</span>';
      results.querySelectorAll('[data-trin]').forEach(b => b.onclick = () => {
        if (!canActFor(wmid)) { toast(`It's ${managerName(wmid)}'s turn at the Trough`); return; }
        const inId = +b.dataset.trin, outId = teamView.transferOut;
        state.transfers.push({ managerId: wmid, outId, inId, gw: cur, n: state.transfers.length + 1 });
        (state.waivers[cur] = state.waivers[cur] || { actions: [] }).actions.push({ mid: wmid, outId, inId });
        const lu = state.lineups[wmid]?.[cur];
        if (lu) state.lineups[wmid][cur] = lu.filter(id => id !== outId);
        pushShared('transfers', state.transfers);
        pushShared(`waivers/${cur}/actions`, state.waivers[cur].actions);
        if (state.lineups[wmid]?.[cur]) pushShared(`lineups/${wmid}/${cur}`, state.lineups[wmid][cur]);
        teamView.transferOut = null;
        save(); render();
        toast(`${PLAYER_BY_ID[inId].name} signed from the Trough. Moggi handled the paperwork.`);
      });
    }
    renderTrResults();
  }
  // --- trade desk ---
  const tradeWith = $('#tradeWith'), pickers = $('#tradePickers');
  if (tradeWith) {
    tradeWith.onchange = () => {
      const other = +tradeWith.value;
      if (!other) { pickers.innerHTML = ''; return; }
      const cur = currentGwIndex();
      const mine = squadAt(mid, cur).sort((a, b) => POS_ORDER[a.pos] - POS_ORDER[b.pos]);
      const theirs = squadAt(other, cur).sort((a, b) => POS_ORDER[a.pos] - POS_ORDER[b.pos]);
      pickers.innerHTML = `
        <select id="tradeMine" style="width:100%;margin-bottom:8px">
          <option value="">${esc(managerName(mid))} gives…</option>
          ${mine.map(p => `<option value="${p.id}">${p.pos} — ${esc(p.name)} (${esc(p.team)})</option>`).join('')}
        </select>
        <select id="tradeTheirs" style="width:100%;margin-bottom:8px">
          <option value="">${esc(managerName(other))} gives…</option>
          ${theirs.map(p => `<option value="${p.id}">${p.pos} — ${esc(p.name)} (${esc(p.team)})</option>`).join('')}
        </select>
        <button class="btn small" id="tradeGo">Execute trade</button>`;
      $('#tradeGo').onclick = () => {
        if (!canActFor(mid) && !canActFor(other)) { toast('You are not part of this trade'); return; }
        const a = +$('#tradeMine').value, b = +$('#tradeTheirs').value;
        if (!a || !b) { toast('Pick a player from each side'); return; }
        const pa = PLAYER_BY_ID[a], pb = PLAYER_BY_ID[b];
        if (pa.pos !== pb.pos) {
          const qa = posCount(mid), qb = posCount(other), q = state.settings.quotas;
          if (qa[pb.pos] >= q[pb.pos] || qb[pa.pos] >= q[pa.pos]) { toast('Trade breaks a position quota'); return; }
        }
        const max = state.settings.maxPerCountry;
        if (countryCount(squadAt(mid, cur).filter(p => p.id !== a), pb.team) >= max ||
            countryCount(squadAt(other, cur).filter(p => p.id !== b), pa.team) >= max) {
          toast('Trade breaks the country limit'); return;
        }
        state.transfers.push({ managerId: mid, outId: a, inId: b, gw: cur, n: state.transfers.length + 1, trade: true });
        state.transfers.push({ managerId: other, outId: b, inId: a, gw: cur, n: state.transfers.length + 1, trade: true });
        for (const [m2, gone] of [[mid, a], [other, b]]) {
          const lu = state.lineups[m2]?.[cur];
          if (lu) {
            state.lineups[m2][cur] = lu.filter(id => id !== gone);
            pushShared(`lineups/${m2}/${cur}`, state.lineups[m2][cur]);
          }
        }
        pushShared('transfers', state.transfers);
        save(); render();
        toast(`Trade done: ${pa.name} ↔ ${pb.name}. Nobody saw anything.`);
      };
    };
  }
}

/* ----- head-to-head ----- */
function viewH2H() {
  const standings = h2hStandings();
  const anyFinal = standings.some(r => r.p > 0);
  return `
  <div class="card" style="margin-bottom:18px">
    <h2>Head-to-Head table <span class="muted" style="font-weight:400;font-size:12px">win 3 &middot; draw 1 &middot; loss 0 &middot; tiebreak: overall points</span></h2>
    <table class="pool-table">
      <thead><tr><th></th><th>Manager</th><th class="num">P</th><th class="num">W</th><th class="num">D</th><th class="num">L</th><th class="num">Pts</th><th class="num">Overall</th></tr></thead>
      <tbody>
      ${standings.map((r, i) => `
        <tr>
          <td class="muted">${i + 1}</td>
          <td><b>${esc(r.name)}</b> ${anyFinal && i === 0 ? '&#127942;' : ''}</td>
          <td class="num">${r.p}</td><td class="num">${r.w}</td><td class="num">${r.d}</td><td class="num">${r.l}</td>
          <td class="num gold">${r.pts}</td>
          <td class="num muted">${managerPoints(r.id)}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>
  ${GAMEWEEKS.map((g, i) => {
    const st = gwStatus(i);
    const tag = st === 'final' ? '<span class="tag">FT</span>'
      : st === 'live' ? '<span class="tag live-tag"><span class="rec"></span>LIVE</span>'
      : st === 'underway' ? '<span class="tag">underway — tap the lines</span>'
      : '<span class="tag">upcoming</span>';
    return `
    <div class="card" style="margin-bottom:12px">
      <h2 style="display:flex;align-items:center;gap:10px">GW${g.n} &middot; ${g.label} ${tag}</h2>
      ${pairingsFor(i).map(([a, b]) => {
        const pa = st === 'upcoming' ? '–' : gwManagerPoints(a, i);
        const pb = st === 'upcoming' ? '–' : gwManagerPoints(b, i);
        const aWin = st === 'final' && pa > pb, bWin = st === 'final' && pb > pa;
        return `<div class="h2h-fx">
          <span class="${aWin ? 'h2h-win' : ''}" style="flex:1;text-align:right">${esc(managerName(a))}</span>
          <span class="fx-score">${pa} &ndash; ${pb}</span>
          <span class="${bWin ? 'h2h-win' : ''}" style="flex:1">${esc(managerName(b))}</span>
        </div>`;
      }).join('')}
    </div>`;
  }).join('')}`;
}

/* ----- league table ----- */
function viewTable() {
  const ranked = [...state.managers]
    .map(m => ({ ...m, pts: managerPoints(m.id) }))
    .sort((a, b) => b.pts - a.pts);
  const allDrafted = [...new Set(state.draft.picks.map(pk => pk.playerId).concat(state.transfers.map(t => t.inId)))]
    .map(pid => ({ p: PLAYER_BY_ID[pid], pts: playerPoints(pid).pts }))
    .sort((a, b) => b.pts - a.pts).slice(0, 10);
  const hasPts = ranked.some(r => r.pts !== 0);
  const investigation = hasPts
    ? `<div class="card investigation"><span class="rec"></span><b>INVESTIGATION UPDATE</b> &mdash; ${esc(investigationLine(ranked[0].name, ranked[ranked.length - 1].name))}</div>`
    : '';
  return `
    ${investigation}
    ${ranked.map((m, i) => {
      const moggiTag = !hasPts ? '' :
        i === 0 ? '<span class="tag" title="Calciopoli, Article 6">&#128269; under investigation</span>' :
        i === ranked.length - 1 ? '<span class="tag">&#11015;&#65039; Serie B awaits</span>' : '';
      return `
      <div class="league-row ${i === 0 && m.pts > 0 ? 'leader' : ''}" data-mgr-row="${m.id}" style="cursor:pointer">
        <span class="rank">${i + 1}</span>
        <span class="lname">${esc(m.name)} ${i === 0 && m.pts > 0 ? '&#127942;' : ''} ${moggiTag}</span>
        <span class="lpts">${m.pts}</span>
      </div>
      <div class="breakdown" id="bd-${m.id}" style="display:none">
        ${managerSquad(m.id).map(p => ({ p, c: contributedPoints(m.id, p.id), r: playerPoints(p.id) }))
          .sort((a, b) => b.c - a.c)
          .map(({ p, c, r }) => `<div class="squad-row" title="All-tournament: ${esc(r.lines.join(' · ') || 'nothing yet')}"><span class="pos-badge pos-${p.pos}">${p.pos}</span>${flagImg(p.team)}<span>${esc(p.name)}</span><span class="muted" style="margin-left:8px;font-size:11.5px">${esc(r.lines.join(' · '))}</span><span class="sp-pts">${c}</span></div>`).join('') || '<span class="muted">Empty squad</span>'}
        <p class="muted" style="font-size:11px;margin-top:8px">Points shown are what each player banked while in the starting XI.</p>
      </div>`;
    }).join('')}
    <div class="card toplist" style="margin-top:24px">
      <h2>Top players (all drafted &amp; signed)</h2>
      ${allDrafted.map(({ p, pts }) => `
        <div class="squad-row"><span class="pos-badge pos-${p.pos}">${p.pos}</span>${flagImg(p.team)}
        <span>${esc(p.name)}</span>
        <span class="sp-pts gold">${pts}</span></div>`).join('') || '<span class="muted">Points appear once matches are played and synced.</span>'}
    </div>`;
}
function bindTable() {
  document.querySelectorAll('[data-mgr-row]').forEach(row => row.onclick = () => {
    const bd = $(`#bd-${row.dataset.mgrRow}`);
    bd.style.display = bd.style.display === 'none' ? 'block' : 'none';
  });
}

/* ----- fixtures ----- */
function viewFixtures() {
  if (!state.fixtures.length) {
    return `<div class="card" style="text-align:center;padding:50px">
      <h2>No fixtures loaded yet</h2>
      <p class="muted" style="margin:10px 0 18px">Tap the lines to pull the full tournament schedule and any results.</p>
      <button class="btn" onclick="syncNow(true)">&#128222; Tap the lines</button></div>`;
  }
  const byDay = {};
  for (const f of state.fixtures) {
    const d = new Date(f.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
    (byDay[d] = byDay[d] || []).push(f);
  }
  return Object.entries(byDay).map(([day, fxs]) => `
    <div class="fx-day"><h3>${day}</h3><div class="fx-grid">
    ${fxs.map(f => {
      const live = f.state === 'in';
      const score = f.state === 'pre' ? new Date(f.date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : `${f.hs ?? ''}–${f.as ?? ''}`;
      return `<div class="fx ${live ? 'live' : ''}">
        <div class="fx-team right"><span>${esc(teamFromEspn(f.home) || f.home)}</span>${flagImg(teamFromEspn(f.home) || '')}</div>
        <span class="fx-score">${score}</span>
        <div class="fx-team"><span>${flagImg(teamFromEspn(f.away) || '')}</span><span>${esc(teamFromEspn(f.away) || f.away)}</span></div>
        <span class="fx-time">${live ? esc(f.detail) : (f.completed ? 'FT' : '')}</span>
      </div>`;
    }).join('')}
    </div></div>`).join('');
}

/* ----- rules ----- */
function viewRules() {
  const sc = state.settings.scoring;
  const q = state.settings.quotas;
  return `
  <div class="settings-grid">
    <div class="card">
      <h2>The basics</h2>
      <p class="rules-p">Four managers. One snake draft over all ${PLAYERS.length} players from the 48 official FIFA squads — order reverses every round.</p>
      <p class="rules-p">Squads of <b>${state.settings.squadSize}</b>: ${q.GK} GK, ${q.DF} DF, ${q.MF} MF, ${q.FW} FW. Maximum <b>${state.settings.maxPerCountry} players per country</b>.</p>
      <h3>Gameweeks</h3>
      ${GAMEWEEKS.map((g, i) => `<div class="score-row"><span>GW${g.n} — ${g.label}</span><span class="muted">${new Date(gwFrom(i)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${new Date(g.to).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span></div>`).join('')}
    </div>
    <div class="card">
      <h2>Your team, every gameweek</h2>
      <p class="rules-p"><b>Starting XI:</b> pick 11 from your 15 each gameweek — 1 GK, 3–5 DF, 2–5 MF, 1–3 FW. <b>Only starters score.</b></p>
      <p class="rules-p"><b>Forgot to set it?</b> Last week's XI carries over (or a best XI is auto-picked). Nobody scores nil for being on holiday.</p>
      <p class="rules-p"><b>Auto-subs:</b> if a starter doesn't play at all that gameweek, your best bench player who did play comes in automatically.</p>
      <h3>Scoring</h3>
      ${Object.keys(DEFAULT_SCORING).map(k => `<div class="score-row"><span>${SCORING_LABELS[k]}</span><b class="gold">${sc[k] > 0 ? '+' : ''}${sc[k]}</b></div>`).join('')}
      <p class="muted" style="font-size:11.5px;margin-top:8px">Goals, assists, starts, subs, clean sheets. No captains. No bonus nonsense.</p>
    </div>
    <div class="card">
      <h2>Head-to-head</h2>
      <p class="rules-p">Each gameweek you face one rival — your starters' points vs theirs. <b>Win 3, draw 1, loss 0.</b> Pairings rotate so everyone plays everyone. Tiebreak: overall points.</p>
      <h2 style="margin-top:18px">The Trough &amp; trades</h2>
      <p class="rules-p"><b>Waiver draft:</b> every gameweek, one swap each from the Trough (all undrafted players). <b>Bottom of the table feeds first.</b> Pass if nothing tempts you.</p>
      <p class="rules-p"><b>Trades:</b> player-for-player swaps between managers, any time, agreed in the group. Doesn't use your waiver turn.</p>
      <h2 style="margin-top:18px">The small print</h2>
      <p class="rules-p">Live scores from ESPN, synced automatically. The commissioner (${esc(managerName(state.managers[0]?.id))}) settles disputes, can act for absent managers, and adjusts points if the feed errs.</p>
      <p class="rules-p muted" style="font-style:italic">All decisions are final. Especially the pre-arranged ones. — L. Moggi</p>
    </div>
  </div>`;
}

/* ----- settings ----- */
function viewSettings() {
  const sc = state.settings.scoring;
  return `<div class="settings-grid">
    <div class="card">
      <h2>Scoring rules</h2>
      ${Object.keys(DEFAULT_SCORING).map(k => `
        <div class="score-row"><span>${SCORING_LABELS[k]}</span>
        <input type="number" step="1" data-score="${k}" value="${sc[k]}"></div>`).join('')}
      <p class="muted" style="margin-top:10px;font-size:12px">Only your starting XI scores each gameweek. Changes apply instantly to all past and future matches.</p>
    </div>
    <div class="card">
      <h2>League admin</h2>
      <div style="display:flex;flex-direction:column;gap:10px">
        <button class="btn ghost" id="inviteBtn2">&#128172; Invite the lads (WhatsApp-ready)</button>
        <button class="btn ghost" id="demoBtn2">Demo mode — preview with fake results</button>
        <button class="btn ghost" id="exportBtn">Export league file (backup)</button>
        <label class="btn ghost" style="text-align:center;cursor:pointer">Import league file<input type="file" id="importFile" accept=".json" style="display:none"></label>
        <button class="btn danger" id="resetBtn">Reset everything</button>
      </div>
      <p class="muted" style="font-size:12px;margin-top:10px">One file is the truth. Commissioner makes lineup/transfer changes, exports, drops it in the group; everyone else imports.</p>
      <h3 style="margin-top:18px">Manual point adjustments</h3>
      <p class="muted" style="font-size:12px;margin-bottom:8px">If a stat feed gets something wrong, add/subtract points per player.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <select id="adjPlayer" style="flex:1;min-width:200px">
          <option value="">Pick a player…</option>
          ${state.managers.flatMap(m => managerSquad(m.id).map(p => `<option value="${p.id}">${esc(p.name)} (${esc(m.name)})</option>`)).join('')}
        </select>
        <input type="number" id="adjPts" placeholder="±pts" style="width:90px">
        <button class="btn small" id="adjApply">Apply</button>
      </div>
      ${Object.entries(state.adjustments).filter(([, v]) => v).map(([pid, v]) =>
        `<div class="score-row"><span>${esc(PLAYER_BY_ID[pid]?.name)}</span><span class="gold">${v > 0 ? '+' : ''}${v}</span></div>`).join('')}
    </div>
    <div class="card">
      <h2>Unmatched players ${state.unmatched.length ? `<span class="tag">${state.unmatched.length}</span>` : ''}</h2>
      <p class="muted" style="font-size:12px;margin-bottom:8px">Players from synced matches the app couldn't auto-match to a squad name. Assign them once and they're remembered.</p>
      ${state.unmatched.map((u, i) => `
        <div class="unmatched-row">
          <span><b>${esc(u.espnName)}</b> <span class="muted">(${esc(u.espnTeam)} — ${esc(u.label)})</span></span>
          <select data-um="${i}">
            <option value="">Match to…</option>
            ${PLAYERS.filter(p => p.team === u.espnTeam).map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}
          </select>
        </div>`).join('') || '<span class="muted">None — all players matched.</span>'}
    </div>
  </div>`;
}
function bindSettings() {
  document.querySelectorAll('[data-score]').forEach(inp => inp.onchange = () => {
    if (netOn() && !isCommissioner()) { toast('Only the commissioner changes scoring'); render(); return; }
    state.settings.scoring[inp.dataset.score] = +inp.value || 0;
    pushShared(`settings/scoring/${inp.dataset.score}`, state.settings.scoring[inp.dataset.score]);
    save(); toast('Scoring updated');
  });
  $('#inviteBtn2').onclick = shareInvite;
  $('#demoBtn2').onclick = enterDemo;
  $('#exportBtn').onclick = () => {
    const blob = new Blob([JSON.stringify(state, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'wc26-league.json';
    a.click();
    toast('League file downloaded');
  };
  $('#importFile').onchange = e => {
    const f = e.target.files[0];
    if (!f) return;
    f.text().then(txt => {
      try {
        const imported = JSON.parse(txt);
        if (!imported.managers || !imported.draft) throw new Error('bad file');
        if (!imported.lineups) { imported.lineups = {}; imported.transfers = []; }
        if (!imported.waivers) imported.waivers = {};
        state = imported;
        if (netOn() && isCommissioner()) publishAll();
        save(); render(); toast('League imported');
      } catch { toast('That file doesn’t look like a league export'); }
    });
  };
  $('#resetBtn').onclick = () => {
    if (netOn() && !isCommissioner()) { toast('Only the commissioner can reset the league'); return; }
    if (confirm('Wipe the league, draft and all scores — for EVERYONE?')) {
      state = freshState();
      if (netOn()) window.WCSync.setRoot(null);
      save(); render();
    }
  };
  $('#adjApply').onclick = () => {
    if (netOn() && !isCommissioner()) { toast('Only the commissioner adjusts points'); return; }
    const pid = +$('#adjPlayer').value, pts = +$('#adjPts').value || 0;
    if (!pid) return;
    state.adjustments[pid] = (state.adjustments[pid] || 0) + pts;
    pushShared(`adjustments/${pid}`, state.adjustments[pid]);
    save(); render(); toast('Adjustment applied');
  };
  document.querySelectorAll('[data-um]').forEach(sel => sel.onchange = () => {
    const u = state.unmatched[+sel.dataset.um];
    const pid = +sel.value;
    if (!u || !pid) return;
    if (u.espnId) {
      state.playerMap[u.espnId] = pid;
      pushShared(`playerMap/${u.espnId}`, pid);
    }
    state.unmatched = state.unmatched.filter(x => x !== u);
    delete state.matchStats[u.eventId]; // reprocess this match on next sync
    save(); render();
    toast('Matched — will be re-scored on next sync');
    syncNow(false);
  });
}

/* ---------------- boot ---------------- */
render();
// auto-sync on load during the tournament (max once per 20 min, always if live)
if (state.phase === 'season') {
  const stale = !state.lastSync || (Date.now() - new Date(state.lastSync).getTime()) > 20 * 60 * 1000;
  if (stale || anyMatchLive()) syncNow(false);
}
