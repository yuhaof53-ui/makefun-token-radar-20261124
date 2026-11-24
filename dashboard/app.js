// Token Radar's dashboard: the board, the live set, the model and its sandbox.
//
// The page reads window.RADAR from data.js (written by main.ts from the same board) and nothing
// else: no fetch, no network. The farm plan and the implied value are derived here from the same
// rules as lib/model.ts, so the page and the board always agree: the detail view recomputes a row
// from its TVL, its category multiple, its growth, its age and its chains, and the sandbox only
// changes the four weights. The submitted board.json keeps the published model.
'use strict';

const RADAR = window.RADAR;
const MODEL = RADAR.model;
const MULTIPLES = RADAR.multiples;
const WATCHLIST = new Set(RADAR.watchlist);

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** $1,234,567,890 or $1.2B when compact: the board's numbers, readable at a glance. */
function fmtMoney(n) {
  if (n === null || n === undefined) return '—';
  return `$${Math.round(n).toLocaleString('en-US')}`;
}
function fmtCompact(n) {
  if (n === null || n === undefined) return '—';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${Math.round(n)}`;
}
function fmtPct(n) {
  if (n === null || n === undefined) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
}
function fmtAge(days) {
  if (days === null || days === undefined) return '—';
  if (days >= 365) return `${(days / 365).toFixed(1)}y`;
  if (days >= 30) return `${Math.round(days / 30)}mo`;
  return `${days}d`;
}

/** The multiple one category gets: its own shrunk median, or the global multiple with no comps. */
function multipleFor(category) {
  const entry = category !== null ? MULTIPLES.by_category[category] : undefined;
  return entry !== undefined ? entry.multiple : MULTIPLES.global_multiple;
}

/** A row's implied value under the given weights, from the same formula as lib/model.ts. */
function impliedOf(row, w) {
  const age = row.age_days === null || row.age_days === undefined ? MODEL.unknown_age_days : row.age_days;
  const growthPct = Math.min(MODEL.growth_cap, Math.max(MODEL.growth_floor, row.change_7d ?? 0));
  const growthMult = 1 + (growthPct / 100) * w.growth;
  const maturityMult = w.maturity + (Math.min(Math.max(age, 0), MODEL.maturity_days) / MODEL.maturity_days) * (1 - w.maturity);
  const extra = Math.min(Math.max(row.chains.length - 1, 0), MODEL.breadth_max_chains);
  const breadthMult = 1 + w.breadth * extra;
  const catMult = multipleFor(row.category) * w.scale;
  const implied = Math.max(1, Math.round(row.tvl_usd * catMult * growthMult * maturityMult * breadthMult));
  return { implied, catMult, growthPct, growthMult, maturityMult, breadthMult, age };
}

/** The published weights: the sandbox starts here, and the board is ranked on these. */
function publishedWeights() {
  return { growth: MODEL.growth_weight, maturity: MODEL.maturity_floor, breadth: MODEL.breadth_per_chain, scale: 1 };
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(row) {
  return row.chains.length > 0 ? row.chains[0] : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(row) {
  if (row.tvl_usd >= 5_000_000_000) return 250;
  if (row.tvl_usd >= 1_000_000_000) return 150;
  if (row.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age) {
  if (age === null || age === undefined) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's main action, in the words a farmer can follow. */
function actionFor(row, capital, chain) {
  const c = (row.category ?? '').toLowerCase();
  const name = row.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt token.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedged position.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('yield aggregator')) return `Deposit $${capital} of USDC into ${name}'s vault on ${chain} and let it auto-compound.`;
  if (c.includes('yield')) return `Deposit $${capital} of USDC into ${name}'s highest-yield pool on ${chain}.`;
  if (c.includes('launchpad')) return `Stake $${capital} of the launchpad's asset on ${name} to qualify for allocations.`;
  if (c.includes('options')) return `Deposit $${capital} of USDC as collateral on ${name} and write one covered call.`;
  if (c.includes('nft')) return `List or buy one item through ${name} on ${chain} and keep the receipt.`;
  if (c.includes('payment')) return `Route one $${capital} payment through ${name} on ${chain}.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The category's second qualifying action: proof of repeated, real use. */
function secondActionFor(row, capital, chain) {
  const c = (row.category ?? '').toLowerCase();
  const name = row.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Borrow $25 against the supply on ${name}, hold it a week, then repay it in full.`;
  if (c.includes('dex') || c.includes('leveraged farm')) return `Swap $25 through ${name}'s main pool on ${chain} once a week.`;
  if (c.includes('bridge')) return `Bridge $25 back the other way through ${name} so the round trip is on record.`;
  if (c.includes('staking') || c.includes('restak')) return `Delegate a second small stake through ${name} to a different validator.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Close the hedge on ${name}, then open a fresh one the next week.`;
  if (c.includes('prediction')) return `Settle the first position on ${name} and open a second one in another market.`;
  if (c.includes('curator') || c.includes('allocator')) return `Claim the vault's accrued yield on ${name} and redeposit it.`;
  if (c.includes('stable')) return `Use the minted stable asset in one lending market on ${chain}.`;
  if (c.includes('rwa')) return `Check the yield asset's net asset value on ${name} once a month and keep the record.`;
  if (c.includes('insurance')) return `File one test claim inquiry on ${name} so the policy is active on record.`;
  if (c.includes('yield')) return `Harvest the yield on ${name} once and redeposit it into the same pool.`;
  if (c.includes('launchpad')) return `Vote in one allocation round on ${name}.`;
  if (c.includes('options')) return `Let the first covered call on ${name} expire, then write another.`;
  if (c.includes('nft')) return `Hold the item for a week, then list a second one through ${name}.`;
  if (c.includes('payment')) return `Route a second payment through ${name} in a different week.`;
  return `Make one more qualifying action on ${name} in a different week, such as a swap, a vote or a deposit.`;
}

/** A row's farm plan: seven steps, each an action with a cost and a time. */
function farmSteps(row) {
  const chain = chainOf(row);
  const capital = capitalFor(row);
  const hold = holdDaysFor(row.age_days);
  const steps = [
    { text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`, cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
    { text: actionFor(row, capital, chain), cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`, time: '15 minutes to set up' },
    { text: secondActionFor(row, capital, chain), cost: 'about $25 of capital moved and $2 of gas', time: '10 minutes' },
    { text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`, cost: 'about $2 of gas a week', time: '10 minutes a week' },
    { text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`, cost: `the $${capital} stays in the position`, time: `${hold} days` },
    { text: `Open the protocol's own points or rewards page once a week and check the position is counted; claim only from the link it publishes.`, cost: 'no fee to check, and never pay to claim', time: '10 minutes a week' },
    { text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`, cost: 'nothing but the log', time: '5 minutes' },
  ];
  return steps.map((s) => {
    let t = `${s.text} Cost: ${s.cost}. Time: ${s.time}.`;
    if (t.length > 600) t = `${t.slice(0, 596)}...`;
    if (t.length < 20) t = `${t} Hold the position and check the protocol's own page.`;
    return t;
  });
}

/* ------------------------------------------------------------ the board */

const state = {
  view: 'board',
  q: '',
  category: '',
  chain: '',
  minTvl: 0,
  growth: '',
  watchlistOnly: false,
  sort: 'implied',
  weights: publishedWeights(),
  detail: null,
};

/** The rows under the current filters, re-ranked under the sandbox weights. */
function visibleRows() {
  const q = state.q.trim().toLowerCase();
  let rows = RADAR.rows.filter((r) => {
    if (q !== '' && !r.name.toLowerCase().includes(q) && !r.slug.toLowerCase().includes(q)) return false;
    if (state.category !== '' && r.category !== state.category) return false;
    if (state.chain !== '' && !r.chains.includes(state.chain)) return false;
    if (r.tvl_usd < state.minTvl) return false;
    if (state.growth === 'gainers' && !(r.change_7d !== null && r.change_7d > 0)) return false;
    if (state.growth === 'decliners' && !(r.change_7d !== null && r.change_7d < 0)) return false;
    if (state.watchlistOnly && !WATCHLIST.has(r.slug)) return false;
    return true;
  });
  rows = rows.map((r) => ({ row: r, v: impliedOf(r, state.weights) }));
  const by = {
    implied: (a, b) => b.v.implied - a.v.implied || a.row.slug.localeCompare(b.row.slug),
    rank: (a, b) => a.row.rank - b.row.rank,
    tvl: (a, b) => b.row.tvl_usd - a.row.tvl_usd,
    growth: (a, b) => (b.row.change_7d ?? -1e9) - (a.row.change_7d ?? -1e9),
    age: (a, b) => (b.row.age_days ?? -1) - (a.row.age_days ?? -1),
    name: (a, b) => a.row.name.localeCompare(b.row.name),
  }[state.sort];
  rows.sort(by);
  return rows;
}

function renderBoard() {
  const rows = visibleRows();
  const maxImplied = Math.max(...RADAR.rows.map((r) => r.implied_value_usd), 1);
  const sandboxOn = JSON.stringify(state.weights) !== JSON.stringify(publishedWeights());
  $('count').textContent = `${rows.length} of ${RADAR.rows.length} protocols` +
    (sandboxOn ? ' — sandbox weights active, re-ranked on the page (board.json keeps the published model)' : '');
  const body = $('board-body');
  body.innerHTML = rows.map(({ row, v }) => {
    const growthCls = row.change_7d === null ? '' : row.change_7d > 0 ? 'pos' : row.change_7d < 0 ? 'neg' : '';
    const badge = WATCHLIST.has(row.slug) ? '<span class="badge">WATCHLIST</span>' : '';
    const pct = Math.max(2, Math.round((v.implied / maxImplied) * 100));
    return `<tr data-slug="${esc(row.slug)}">
      <td class="num rank">${row.rank}</td>
      <td><span class="name">${esc(row.name)}</span>${badge}<br><span class="slug">${esc(row.slug)}</span></td>
      <td>${esc(row.category ?? '—')}</td>
      <td>${esc(row.chains.slice(0, 3).join(', '))}${row.chains.length > 3 ? ` +${row.chains.length - 3}` : ''}</td>
      <td class="num">${fmtCompact(row.tvl_usd)}</td>
      <td class="num ${growthCls}">${fmtPct(row.change_7d)}</td>
      <td class="num">${fmtAge(row.age_days)}</td>
      <td class="num">${fmtCompact(v.implied)}<div class="bar"><i style="width:${pct}%"></i></div></td>
    </tr>`;
  }).join('');
}

/* ------------------------------------------------------------ live + multiples */

function renderLive() {
  $('live-body').innerHTML = RADAR.live.map((p, i) => {
    const ratio = p.mcap_usd !== null && p.tvl_usd > 0 ? (p.mcap_usd / p.tvl_usd).toFixed(2) : '—';
    const growthCls = p.change_7d === null ? '' : p.change_7d > 0 ? 'pos' : p.change_7d < 0 ? 'neg' : '';
    return `<tr>
      <td class="num">${i + 1}</td>
      <td><span class="name">${esc(p.name)}</span><br><span class="slug">${esc(p.slug)}</span></td>
      <td>${esc(p.category ?? '—')}</td>
      <td class="num">${fmtCompact(p.tvl_usd)}</td>
      <td class="num">${fmtMoney(p.mcap_usd)}</td>
      <td class="num">${ratio}</td>
      <td class="num ${growthCls}">${fmtPct(p.change_7d)}</td>
    </tr>`;
  }).join('');
}

function renderMultiples() {
  const cats = Object.values(MULTIPLES.by_category).sort((a, b) => b.multiple - a.multiple);
  $('multiples-body').innerHTML = cats.map((c) => `<tr>
    <td>${esc(c.category)}</td>
    <td class="num">${c.n}</td>
    <td class="num">${c.weighted_median.toFixed(4)}</td>
    <td class="num">${c.multiple.toFixed(4)}</td>
  </tr>`).join('') +
  `<tr><td><strong>Global (no comps)</strong></td><td class="num">—</td><td class="num">${MULTIPLES.global_median.toFixed(4)}</td><td class="num">${MULTIPLES.global_multiple.toFixed(4)}</td></tr>`;
}

/* ------------------------------------------------------------ the detail view */

function openDetail(slug) {
  const row = RADAR.rows.find((r) => r.slug === slug);
  if (row === undefined) return;
  const v = impliedOf(row, state.weights);
  const comp = row.category !== null ? MULTIPLES.by_category[row.category] : undefined;
  const steps = farmSteps(row);
  const sandboxOn = JSON.stringify(state.weights) !== JSON.stringify(publishedWeights());
  $('detail-body').innerHTML = `
    <button type="button" class="close" id="detail-close">Close</button>
    <h2>${esc(row.name)} ${WATCHLIST.has(row.slug) ? '<span class="badge">WATCHLIST</span>' : ''}</h2>
    <p class="slug">${esc(row.slug)} · ${esc(row.category ?? 'no category')} · ${esc(row.chains.join(', '))}</p>
    <dl class="kv">
      <div><dt>Board rank</dt><dd>#${row.rank} of ${RADAR.rows.length}</dd></div>
      <div><dt>Implied value</dt><dd>${fmtMoney(v.implied)}</dd></div>
      <div><dt>TVL</dt><dd>${fmtMoney(row.tvl_usd)}</dd></div>
      <div><dt>7-day growth</dt><dd>${fmtPct(row.change_7d)}</dd></div>
      <div><dt>Age, no token</dt><dd>${fmtAge(row.age_days)}${row.age_days === null ? ' (listed date unknown)' : ''}</dd></div>
      <div><dt>Chains</dt><dd>${row.chains.length}</dd></div>
    </dl>
    <h3>How the implied value is built</h3>
    <dl class="kv">
      <div><dt>TVL</dt><dd>${fmtMoney(row.tvl_usd)}</dd></div>
      <div><dt>Category multiple</dt><dd>× ${v.catMult.toFixed(4)}${comp !== undefined ? ` (${comp.n} trading ${comp.n === 1 ? 'token' : 'tokens'}, TVL-weighted median ${comp.weighted_median.toFixed(4)})` : ' (global, no comps in this category)'}</dd></div>
      <div><dt>Growth multiplier</dt><dd>× ${v.growthMult.toFixed(4)} (${fmtPct(v.growthPct)} clamped)</dd></div>
      <div><dt>Maturity multiplier</dt><dd>× ${v.maturityMult.toFixed(4)} (${fmtAge(row.age_days)} old)</dd></div>
      <div><dt>Breadth multiplier</dt><dd>× ${v.breadthMult.toFixed(4)} (${row.chains.length} ${row.chains.length === 1 ? 'chain' : 'chains'})</dd></div>
      <div><dt>Implied value</dt><dd>${fmtMoney(v.implied)}</dd></div>
    </dl>
    ${sandboxOn ? '<p class="sandbox-note">Shown under the sandbox weights, not the published model.</p>' : ''}
    <h3>Farm plan — seven steps</h3>
    <ol class="steps">
      ${steps.map((s) => {
        const m = s.match(/^(.*?) Cost: (.*?)\. Time: (.*?)\.$/);
        if (m === null) return `<li>${esc(s)}</li>`;
        return `<li>${esc(m[1])} <span class="cost">Cost: ${esc(m[2])}. Time: ${esc(m[3])}.</span></li>`;
      }).join('')}
    </ol>
    <p class="table-note">Implied value is an estimate from the snapshot's own figures, not a price. Records no token is not the same as has no token — check the protocol's own pages before farming.</p>`;
  $('detail-close').addEventListener('click', closeDetail);
  $('detail').showModal();
  state.detail = slug;
}

function closeDetail() {
  const d = $('detail');
  if (d.open) d.close();
  state.detail = null;
  writeHash();
}

/* ------------------------------------------------------------ state, hash and events */

function readHash() {
  const h = new URLSearchParams(window.location.hash.slice(1));
  state.q = h.get('q') ?? '';
  state.category = h.get('category') ?? '';
  state.chain = h.get('chain') ?? '';
  state.minTvl = Number(h.get('min-tvl') ?? '0') || 0;
  state.growth = h.get('growth') ?? '';
  state.watchlistOnly = h.get('watchlist') === '1';
  state.sort = h.get('sort') ?? 'implied';
  state.detail = h.get('p');
  if (h.get('view') === 'live' || h.get('view') === 'model') state.view = h.get('view');
}

function writeHash() {
  const h = new URLSearchParams();
  if (state.view !== 'board') h.set('view', state.view);
  if (state.q !== '') h.set('q', state.q);
  if (state.category !== '') h.set('category', state.category);
  if (state.chain !== '') h.set('chain', state.chain);
  if (state.minTvl !== 0) h.set('min-tvl', String(state.minTvl));
  if (state.growth !== '') h.set('growth', state.growth);
  if (state.watchlistOnly) h.set('watchlist', '1');
  if (state.sort !== 'implied') h.set('sort', state.sort);
  if (state.detail !== null) h.set('p', state.detail);
  const s = h.toString();
  history.replaceState(null, '', s === '' ? window.location.pathname : `#${s}`);
}

function applyStateToControls() {
  $('q').value = state.q;
  $('category').value = state.category;
  $('chain').value = state.chain;
  $('min-tvl').value = String(state.minTvl);
  $('growth').value = state.growth;
  $('watchlist-only').checked = state.watchlistOnly;
  $('sort').value = state.sort;
}

function setView(view) {
  state.view = view;
  for (const b of document.querySelectorAll('.tab')) {
    const active = b.dataset.view === view;
    b.classList.toggle('active', active);
    b.setAttribute('aria-pressed', String(active));
  }
  $('view-board').hidden = view !== 'board';
  $('view-live').hidden = view !== 'live';
  $('view-model').hidden = view !== 'model';
  writeHash();
}

function renderAll() {
  renderBoard();
  renderLive();
  renderMultiples();
}

function init() {
  const cats = [...new Set(RADAR.rows.map((r) => r.category).filter((c) => c !== null))].sort();
  for (const c of cats) {
    const o = document.createElement('option');
    o.value = c;
    o.textContent = c;
    $('category').appendChild(o);
  }
  const chains = [...new Set(RADAR.rows.flatMap((r) => r.chains))].sort();
  for (const c of chains) {
    const o = document.createElement('option');
    o.value = c;
    o.textContent = c;
    $('chain').appendChild(o);
  }

  const totalImplied = RADAR.rows.reduce((s, r) => s + r.implied_value_usd, 0);
  const topCat = Object.values(MULTIPLES.by_category).sort((a, b) => b.multiple - a.multiple)[0];
  $('meta').textContent = `Snapshot ${RADAR.as_of} · source ${RADAR.source} · floor ${fmtMoney(RADAR.floor_usd)} TVL · model ${RADAR.model_version}`;
  $('as-of').textContent = new Date(`${RADAR.as_of}T00:00:00Z`).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  $('facts').innerHTML = `
    <div><dt>Protocols in snapshot</dt><dd>${RADAR.protocols_total}</dd></div>
    <div><dt>Watchlist covered</dt><dd>${RADAR.watchlist_size} / ${RADAR.watchlist_size}</dd></div>
    <div><dt>Rows on the board</dt><dd>${RADAR.board_size}</dd></div>
    <div><dt>Early rows found</dt><dd>${RADAR.early_size}</dd></div>
    <div><dt>Total implied value</dt><dd>${fmtCompact(totalImplied)}</dd></div>
    <div><dt>Highest multiple</dt><dd>${topCat !== undefined ? `${topCat.category} ×${topCat.multiple.toFixed(2)}` : '—'}</dd></div>`;
  $('formula-note').textContent = `The category multiple is the TVL-weighted median market-cap-to-TVL of that category's already-trading tokens in this same snapshot (global ${MULTIPLES.global_median.toFixed(4)}, the plain median across all trading tokens), shrunk toward the global multiple with a prior weight of ${MODEL.multiple_prior} and clamped to ${MODEL.multiple_floor}–${MODEL.multiple_cap}. Nothing is hardcoded by name.`;
  $('foot-note').textContent = `${RADAR.board_size} ranked rows, ${RADAR.live_size} live tokens, ${Object.keys(MULTIPLES.by_category).length} categories with trading tokens.`;

  readHash();
  applyStateToControls();
  setView(state.view);
  renderAll();
  if (state.detail !== null) openDetail(state.detail);

  $('q').addEventListener('input', () => { state.q = $('q').value; renderBoard(); writeHash(); });
  $('category').addEventListener('change', () => { state.category = $('category').value; renderBoard(); writeHash(); });
  $('chain').addEventListener('change', () => { state.chain = $('chain').value; renderBoard(); writeHash(); });
  $('min-tvl').addEventListener('change', () => { state.minTvl = Number($('min-tvl').value); renderBoard(); writeHash(); });
  $('growth').addEventListener('change', () => { state.growth = $('growth').value; renderBoard(); writeHash(); });
  $('watchlist-only').addEventListener('change', () => { state.watchlistOnly = $('watchlist-only').checked; renderBoard(); writeHash(); });
  $('sort').addEventListener('change', () => { state.sort = $('sort').value; renderBoard(); writeHash(); });
  for (const b of document.querySelectorAll('.tab')) b.addEventListener('click', () => setView(b.dataset.view));
  $('board-body').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-slug]');
    if (tr !== null) { state.detail = tr.dataset.slug; writeHash(); openDetail(tr.dataset.slug); }
  });
  $('detail').addEventListener('close', () => { state.detail = null; writeHash(); });

  const slider = (id, key, fmt, out) => {
    $(id).addEventListener('input', () => {
      state.weights[key] = Number($(id).value);
      $(out).textContent = fmt(state.weights[key]);
      renderBoard();
    });
  };
  slider('w-growth', 'growth', (v) => v.toFixed(2), 'out-growth');
  slider('w-maturity', 'maturity', (v) => v.toFixed(2), 'out-maturity');
  slider('w-breadth', 'breadth', (v) => v.toFixed(2), 'out-breadth');
  slider('w-scale', 'scale', (v) => `${v.toFixed(2)}×`, 'out-scale');
  $('sandbox-reset').addEventListener('click', () => {
    state.weights = publishedWeights();
    $('w-growth').value = String(state.weights.growth);
    $('w-maturity').value = String(state.weights.maturity);
    $('w-breadth').value = String(state.weights.breadth);
    $('w-scale').value = String(state.weights.scale);
    $('out-growth').textContent = state.weights.growth.toFixed(2);
    $('out-maturity').textContent = state.weights.maturity.toFixed(2);
    $('out-breadth').textContent = state.weights.breadth.toFixed(2);
    $('out-scale').textContent = `${state.weights.scale.toFixed(2)}×`;
    renderBoard();
  });
}

init();
