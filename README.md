# Token Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/yuhaof53-ui/makefun-token-radar-20261124/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/yuhaof53-ui/makefun-token-radar-20261124/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: every protocol in the snapshot that records no token, ranked by what its
token would be worth if it traded at its own category's multiple.

## The model (radar-4)

`implied = TVL × category multiple × (1 + 7-day growth × 0.6) × maturity × breadth`

- **Category multiple.** For each category, the TVL-weighted median market-cap-to-TVL of that
  category's already-trading tokens in the same snapshot, shrunk toward the global multiple with a
  prior weight of 5 and clamped to 0.05–0.50. A category with no trading token takes the global
  multiple. Nothing is hardcoded by name: a future snapshot recomputes every multiple from its own
  figures. The median is weighted by TVL because a market-cap-to-TVL ratio falls as a protocol
  grows: a plain median is set by a category's smallest tokens and overstates what a giant
  protocol's token would be worth. The global multiple is the plain median across all the
  snapshot's trading tokens: the typical token's multiple, not the TVL-weighted one, which the
  biggest protocols would drag down to the floor.
- **What the board ranks.** The house's own rule for a launch candidate, from the competition's
  RULES.txt: a protocol that records no token, whose category is not Bridge, Canonical Bridge,
  Liquid Staking, Liquid Restaking, Restaked BTC or CEX, whose name does not end in a version
  marker, carries no whole word wrapped, staked or staking, and does not begin with an exchange's
  name (Binance, Coinbase, Bybit, Kraken, Bitget, OKX, Bitfinex, Gemini). That is why WBTC,
  Binance staked ETH and USDT0 are not on the board: each is a wrapped or staked product of a
  token that already trades, not a launch.
- **Growth.** Seven-day TVL change, clamped to −60%…+120%.
- **Maturity.** 0.65 + 0.35 × min(age, 1095 days) / 1095. Age is the time since DefiLlama first
  listed the protocol: how long it has run with no token. Unknown age counts as 365 days.
- **Breadth.** 1 + 0.04 per extra chain, up to five extra chains.

## The board

- **198 rows:** all 40 watchlist slugs, plus every other launch candidate the house's rule keeps
  (158 early rows). The watchlist is the floor, never the ceiling.
- **Live tokens** are kept apart: the top 24 by market cap are shown as the market's own values,
  and their ratios are the comps the model reads.
- **Farm plans:** seven steps per row, derived from the protocol's own record — its category sets
  the two qualifying actions, its TVL sets the capital, its age sets the hold. Airdrops reward
  repeated, varied use, not a single deposit.

## The dashboard

A static page, no framework and no network: `dashboard/index.html`, `app.css`, `app.js` read
`data.js`, which `main.ts` writes from the same board. It has the pre-token board (search,
category, chain, TVL and growth filters, watchlist-only toggle, sorting), the live-token view,
the model and method view with the multiples table, a detail view per protocol with the model
breakdown and the farm plan, and a model sandbox: change the four weights and watch the board
re-rank on the page. The sandbox only re-ranks the page; `board.json` keeps the published model.

## Build

```sh
node main.ts --input /input --output /output
```

Reads `/input/snapshot.json`, writes `/output/board.json`, `/output/data.js`,
`/output/dashboard/`, `/output/screenshots/` and `/output/dossier.json`. The build is
deterministic: the same snapshot builds the same bytes twice. Node 22, standard library only.
