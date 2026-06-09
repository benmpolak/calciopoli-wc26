/* ================= WC26 Draft League ================= */
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

/* ---------------- state ---------------- */
let state = load() || freshState();

function freshState() {
  return {
    phase: 'setup', // setup | draft | season
    managers: [
      { id: 1, name: 'Ben Polak' }, { id: 2, name: 'Mrc Cnwy' }, { id: 3, name: 'Iain Tussie' }, { id: 4, name: 'Rick Blank' },
    ],
    settings: {
      squadSize: 15,
      quotas: { GK: 2, DF: 5, MF: 5, FW: 3 },
      scoring: { ...DEFAULT_SCORING },
    },
    draft: { order: [], picks: [] },
    fixtures: [],          // [{id,date,name,home,away,hs,as,state,completed}]
    matchStats: {},        // eventId -> { playerStats: {pid:{app,g,a,yc,rc,og,sv,cs,conceded,ps}}, label }
    playerMap: {},         // espn athlete id -> player id
    unmatched: [],         // [{eventId,label,espnName,espnTeam,key}]
    adjustments: {},       // pid -> manual pts
    lastSync: null,
    view: 'draft',
  };
}
function save() { localStorage.setItem(LS_KEY, JSON.stringify(state)); }
function load() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)); } catch { return null; }
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
function managerSquad(mid) {
  return state.draft.picks.filter(p => p.managerId === mid).map(p => PLAYER_BY_ID[p.playerId]);
}
function posCount(mid) {
  const c = { GK: 0, DF: 0, MF: 0, FW: 0 };
  managerSquad(mid).forEach(p => c[p.pos]++);
  return c;
}
function canPick(mid, player) {
  const q = state.settings.quotas, c = posCount(mid);
  if (c[player.pos] >= q[player.pos]) return false;
  return true;
}
function draftedIds() { return new Set(state.draft.picks.map(p => p.playerId)); }

function makePick(playerId) {
  const mid = currentManagerId();
  if (mid == null) return;
  const player = PLAYER_BY_ID[playerId];
  if (!canPick(mid, player)) { toast(`${managerName(mid)} already has the max ${player.pos}s`); return; }
  state.draft.picks.push({ managerId: mid, playerId, n: pickNo() + 1 });
  if (pickNo() >= totalPicks()) {
    state.phase = 'season';
    state.view = 'squads';
    toast('Draft complete. Moggi has filed the paperwork. Game on.');
  } else if (Math.random() < 0.3) {
    toast(moggiSays());
  }
  save(); render();
}
function autoPick() {
  const mid = currentManagerId();
  if (mid == null) return;
  const taken = draftedIds();
  const best = PLAYERS.filter(p => !taken.has(p.id) && canPick(mid, p))
    .sort((a, b) => (b.goals * 3 + b.caps) - (a.goals * 3 + a.caps))[0];
  if (best) makePick(best.id);
}
function managerName(mid) { return state.managers.find(m => m.id === mid)?.name || `Manager ${mid}`; }

/* ---------------- scoring ---------------- */
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
  const adj = state.adjustments[pid] || 0;
  if (adj) { pts += adj; lines.push(`Manual adj ${adj}`); }
  return { pts, agg, lines };
}
function managerPoints(mid) {
  return managerSquad(mid).reduce((t, p) => t + playerPoints(p.id).pts, 0);
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
  // fallback: surname-only exact
  const eArr = [...eTok];
  const eLast = eArr[eArr.length - 1];
  const surnameHits = candidates.filter(p => { const a = [...nameTokens(p.name)]; return a[a.length - 1] === eLast; });
  if (surnameHits.length === 1) return surnameHits[0];
  return null;
}

async function syncNow(manual = false) {
  const btn = $('#syncBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Syncing…'; }
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

    const done = state.fixtures.filter(f => f.completed && !state.matchStats[f.id]);
    let processed = 0;
    for (const fx of done) {
      try { await processMatch(fx); processed++; }
      catch (err) { console.warn('match parse failed', fx.id, err); }
    }
    state.lastSync = new Date().toISOString();
    save(); render();
    if (manual) toast(processed ? `Synced — ${processed} new result${processed > 1 ? 's' : ''} scored` : 'Synced — no new results');
  } catch (err) {
    console.error(err);
    if (manual) toast('Sync failed — check connection');
  }
  const b2 = $('#syncBtn');
  if (b2) { b2.disabled = false; b2.textContent = 'Sync'; }
}

async function processMatch(fx) {
  const res = await fetch(`${ESPN_BASE}/summary?event=${fx.id}`);
  const data = await res.json();
  const rosters = data.rosters || [];
  if (!rosters.length) return;
  const playerStats = {};
  const label = `${fx.home} ${fx.hs}–${fx.as} ${fx.away}`;
  // score by espn team -> conceded goals
  const scores = {};
  const homeTeam = teamFromEspn(fx.home), awayTeam = teamFromEspn(fx.away);
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
  state.matchStats[fx.id] = { label, date: fx.date, playerStats };
}

/* ---------------- views ---------------- */
const NAV_ITEMS = [
  ['draft', 'Draft Room'],
  ['squads', 'Squads'],
  ['table', 'League Table'],
  ['fixtures', 'Fixtures'],
  ['settings', 'Settings'],
];

function render() {
  renderNav();
  renderSyncArea();
  const main = $('#main');
  if (state.phase === 'setup') { main.innerHTML = viewSetup(); bindSetup(); return; }
  switch (state.view) {
    case 'draft': main.innerHTML = viewDraft(); bindDraft(); break;
    case 'squads': main.innerHTML = viewSquads(); break;
    case 'table': main.innerHTML = viewTable(); bindTable(); break;
    case 'fixtures': main.innerHTML = viewFixtures(); break;
    case 'settings': main.innerHTML = viewSettings(); bindSettings(); break;
    default: state.view = 'draft'; render();
  }
}

function renderNav() {
  const nav = $('#nav');
  if (state.phase === 'setup') { nav.innerHTML = ''; return; }
  nav.innerHTML = NAV_ITEMS.map(([id, label]) => {
    const disabled = (id === 'draft' && state.phase === 'season') ? '' : '';
    return `<button data-view="${id}" class="${state.view === id ? 'active' : ''}" ${disabled}>${label}</button>`;
  }).join('');
  nav.querySelectorAll('button').forEach(b => b.onclick = () => { state.view = b.dataset.view; save(); render(); });
}

function renderSyncArea() {
  const el = $('#syncArea');
  if (state.phase !== 'season') { el.innerHTML = ''; return; }
  const last = state.lastSync ? new Date(state.lastSync).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'never';
  el.innerHTML = `<span>Last sync: ${last}</span><button id="syncBtn" class="btn small">Sync</button>`;
  $('#syncBtn').onclick = () => syncNow(true);
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
      <div class="setup-total" id="setupTotal"></div>
    </div>
    <button class="btn" id="startDraft" style="padding:14px;font-size:16px">Randomise order &amp; start the draft</button>
  </div>`;
}
function bindSetup() {
  const updateTotal = () => {
    const q = state.settings.quotas;
    const total = q.GK + q.DF + q.MF + q.FW;
    state.settings.squadSize = total;
    $('#setupTotal').innerHTML = `Squad size: <b>${total}</b> each &middot; <b>${total * state.managers.length}</b> of ${PLAYERS.length} players drafted &middot; snake order, reversing each round`;
  };
  document.querySelectorAll('[data-mgr]').forEach(inp => inp.oninput = () => {
    state.managers.find(m => m.id === +inp.dataset.mgr).name = inp.value;
  });
  document.querySelectorAll('[data-quota]').forEach(inp => inp.oninput = () => {
    state.settings.quotas[inp.dataset.quota] = Math.max(0, +inp.value || 0);
    updateTotal();
  });
  updateTotal();
  $('#startDraft').onclick = () => {
    state.managers.forEach((m, i) => { if (!m.name.trim()) m.name = `Manager ${i + 1}`; });
    if (state.settings.squadSize < 5) { toast('Squad size looks too small'); return; }
    state.draft.order = state.managers.map(m => m.id).sort(() => Math.random() - 0.5);
    state.phase = 'draft';
    state.view = 'draft';
    save(); render();
    toast(`Draft order: ${state.draft.order.map(managerName).join(' → ')}`);
  };
}

/* ----- draft room ----- */
let poolFilter = { q: '', team: '', pos: '', sort: 'caps', limit: 60 };

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
    : b.caps - a.caps);
  const total = rows.length;
  rows = rows.slice(0, poolFilter.limit);
  return `
  <table class="pool-table">
    <thead><tr>
      <th data-sort="name">Player</th><th>Nation</th><th>Pos</th>
      <th class="num" data-sort="age">Age</th>
      <th class="num" data-sort="caps">Caps ${s === 'caps' ? '▾' : ''}</th>
      <th class="num" data-sort="goals">Goals ${s === 'goals' ? '▾' : ''}</th><th></th>
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
        <td><button class="btn small" data-pick="${p.id}" ${canPick(mid, p) ? '' : 'disabled title="Position full"'}>Draft</button></td>
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
  $('#undoPick').onclick = () => { state.draft.picks.pop(); save(); render(); };
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
  return `<div class="card"><h2>Draft complete</h2>
    <p class="muted" style="margin-bottom:12px">All ${totalPicks()} picks are in. Full picks by round:</p>
    <div class="pick-log" style="max-height:none">
    ${state.draft.picks.map(pk => {
      const p = PLAYER_BY_ID[pk.playerId];
      return `<div class="lrow"><span class="muted" style="width:38px">#${pk.n}</span><b style="width:130px">${esc(managerName(pk.managerId))}</b>${flagImg(p.team)} ${esc(p.name)} <span class="muted">· ${p.pos} · ${esc(p.team)}</span></div>`;
    }).join('')}
    </div></div>`;
}

/* ----- squads ----- */
function viewSquads() {
  return `<div class="squads-grid">
    ${state.managers.map(m => {
      const squad = managerSquad(m.id).sort((a, b) => POS_ORDER[a.pos] - POS_ORDER[b.pos] || playerPoints(b.id).pts - playerPoints(a.id).pts);
      return `<div class="card squad-card">
        <div class="mgr-head"><h2>${esc(m.name)}</h2><span class="pts">${managerPoints(m.id)} pts</span></div>
        ${squad.map(p => {
          const pp = playerPoints(p.id);
          return `<div class="squad-row" title="${esc(pp.lines.join(' · ') || 'No points yet')}">
            <span class="pos-badge pos-${p.pos}">${p.pos}</span>${flagImg(p.team)}
            <span>${esc(p.name)}</span><span class="sp-pts ${pp.pts > 0 ? 'gold' : 'muted'}">${pp.pts}</span>
          </div>`;
        }).join('') || '<span class="muted">Empty</span>'}
      </div>`;
    }).join('')}
  </div>`;
}

/* ----- league table ----- */
function viewTable() {
  const ranked = [...state.managers]
    .map(m => ({ ...m, pts: managerPoints(m.id) }))
    .sort((a, b) => b.pts - a.pts);
  const allDrafted = state.draft.picks.map(pk => ({ pk, p: PLAYER_BY_ID[pk.playerId], pts: playerPoints(pk.playerId).pts }))
    .sort((a, b) => b.pts - a.pts).slice(0, 10);
  const hasPts = ranked.some(r => r.pts !== 0);
  return `
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
        ${managerSquad(m.id).map(p => ({ p, r: playerPoints(p.id) }))
          .sort((a, b) => b.r.pts - a.r.pts)
          .map(({ p, r }) => `<div class="squad-row"><span class="pos-badge pos-${p.pos}">${p.pos}</span>${flagImg(p.team)}<span>${esc(p.name)}</span><span class="muted" style="margin-left:8px;font-size:11.5px">${esc(r.lines.join(' · '))}</span><span class="sp-pts">${r.pts}</span></div>`).join('') || '<span class="muted">Empty squad</span>'}
      </div>`;
    }).join('')}
    <div class="card toplist" style="margin-top:24px">
      <h2>Top drafted players</h2>
      ${allDrafted.map(({ pk, p, pts }) => `
        <div class="squad-row"><span class="pos-badge pos-${p.pos}">${p.pos}</span>${flagImg(p.team)}
        <span>${esc(p.name)}</span><span class="muted">· ${esc(managerName(pk.managerId))}</span>
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
      <p class="muted" style="margin:10px 0 18px">Hit sync to pull the full tournament schedule and any results.</p>
      <button class="btn" onclick="syncNow(true)">Sync now</button></div>`;
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

/* ----- settings ----- */
function viewSettings() {
  const sc = state.settings.scoring;
  return `<div class="settings-grid">
    <div class="card">
      <h2>Scoring rules</h2>
      ${Object.keys(DEFAULT_SCORING).map(k => `
        <div class="score-row"><span>${SCORING_LABELS[k]}</span>
        <input type="number" step="1" data-score="${k}" value="${sc[k]}"></div>`).join('')}
      <p class="muted" style="margin-top:10px;font-size:12px">Changes apply instantly to all past and future matches.</p>
    </div>
    <div class="card">
      <h2>League admin</h2>
      <div style="display:flex;flex-direction:column;gap:10px">
        <button class="btn ghost" id="exportBtn">Export league file (share with the lads)</button>
        <label class="btn ghost" style="text-align:center;cursor:pointer">Import league file<input type="file" id="importFile" accept=".json" style="display:none"></label>
        <button class="btn danger" id="resetBtn">Reset everything</button>
      </div>
      <h3 style="margin-top:22px">Manual point adjustments</h3>
      <p class="muted" style="font-size:12px;margin-bottom:8px">If a stat feed gets something wrong, add/subtract points per player.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <select id="adjPlayer" style="flex:1;min-width:200px">
          <option value="">Pick a drafted player…</option>
          ${state.draft.picks.map(pk => { const p = PLAYER_BY_ID[pk.playerId]; return `<option value="${p.id}">${esc(p.name)} (${esc(managerName(pk.managerId))})</option>`; }).join('')}
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
    state.settings.scoring[inp.dataset.score] = +inp.value || 0;
    save(); toast('Scoring updated');
  });
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
        state = imported; save(); render(); toast('League imported');
      } catch { toast('That file doesn’t look like a league export'); }
    });
  };
  $('#resetBtn').onclick = () => {
    if (confirm('Wipe the league, draft and all scores?')) {
      state = freshState(); save(); render();
    }
  };
  $('#adjApply').onclick = () => {
    const pid = +$('#adjPlayer').value, pts = +$('#adjPts').value || 0;
    if (!pid) return;
    state.adjustments[pid] = (state.adjustments[pid] || 0) + pts;
    save(); render(); toast('Adjustment applied');
  };
  document.querySelectorAll('[data-um]').forEach(sel => sel.onchange = () => {
    const u = state.unmatched[+sel.dataset.um];
    const pid = +sel.value;
    if (!u || !pid) return;
    if (u.espnId) state.playerMap[u.espnId] = pid;
    state.unmatched = state.unmatched.filter(x => x !== u);
    delete state.matchStats[u.eventId]; // reprocess this match on next sync
    save(); render();
    toast('Matched — will be re-scored on next sync');
    syncNow(false);
  });
}

/* ---------------- boot ---------------- */
render();
// auto-sync on load during the tournament (max once per 20 min)
if (state.phase === 'season') {
  const stale = !state.lastSync || (Date.now() - new Date(state.lastSync).getTime()) > 20 * 60 * 1000;
  if (stale) syncNow(false);
}
