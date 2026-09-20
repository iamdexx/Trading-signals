# Coinbase Signals

> **Disclaimer:** This application is educational software and is not financial advice. It only
> produces signals and paper-account analytics; it never places orders. Crypto assets are volatile.
> Past performance does not guarantee future results.

Coinbase Signals fetches public Coinbase USD spot market data, caches up to 3000
configured-timeframe bars and 500 daily bars per product in SQLite, evaluates a closed-bar
trend-following pullback strategy, and reports paper P&L and event-driven backtests. The default
timeframe is four hours.

## Strategy rules

The strategy is long-only and evaluates closed bars. A daily regime is mapped to each configured
timeframe bar
using the latest daily bar whose `start + 86400 <= configured-timeframe bar start`, so no future
daily bar is used.
The bullish regime requires daily close above EMA200 and daily EMA50 above EMA200. Products with
fewer than 210 daily bars have an `unknown` regime and are ineligible for entries. Products with
fewer than 300 configured-timeframe bars are marked `insufficient_history` and excluded from the
ranked trading universe. The same
per-bar regime calculation is applied to BTC-USD as the market filter; a long requires both the
product and BTC market regimes to be bullish. In a bearish BTC regime the app stands aside and
opens no new long setups.

An entry requires all of these conditions:

1. Close above EMA50 and EMA20 above EMA50.
2. During the previous eight bars RSI14 was below 50 or a low touched EMA20, and RSI crossed above
   50, MACD histogram crossed from negative to positive, or close broke above the previous three
   highs while RSI14 was above 50.
3. MACD line is above signal.
4. Volume is at least 0.8 times its 20-bar SMA.
5. ATR14 / close is between 0.3% and 8%, and ADX14 is at least 18.
6. The product and BTC market regimes are bullish, no position is open, and the six-bar stop
   cooldown has ended.

Signals are scored out of 100: trend 25, pullback 25, momentum 15, volume 15, ADX 10, and regime 10. A signal on bar `t` fills at the next bar's open with configured slippage.

Initial risk is `stopAtrMult` ATR at entry. When `partialEnabled` is true, `targetR` triggers a
50% exit and the stop moves to breakeven. The remaining quantity trails at highest high since
entry minus `trailAtrMult` current ATR. When partials are disabled, the full position uses the
chandelier trail from entry. A low through the stop fills at the stop, or at the open when the bar
gaps below it. Two consecutive closes below EMA50 exits at the next open. A bearish regime exits
at the next open. Fees and slippage apply to every fill, including partial exits. Position size is
risk percentage or fixed USD, capped by max notional percentage.

## Settings

Settings are persisted in SQLite and can be changed from the Settings page or `PUT /api/settings`:
starting equity, sizing mode, risk percentage, fixed USD per trade, max positions, max notional
percentage, fee/slippage bps, stop ATR multiple, target R, trail ATR multiple, partial-target
toggle, universe size, and timeframe. Defaults are FOUR_HOUR, stop 3 ATR, target 1.5R, trail 3
ATR, partials enabled, 60 bps fees, and 5 bps slippage. `POST
/api/paper/reset` clears paper positions, signals, equity, and processed-bar state while preserving
candle cache.

## Run

```bash
npm install
cp .env.example .env
npm run dev
```

The development API runs on `:4000` and Vite runs on `:5173`. Production uses:

```bash
npm run format
npm run format:check
npm run lint
npm test
npm run build
npm start
```

Backtest one product with:

```bash
npm run backtest -- --product BTC-USD
npm run sweep
```

`npm run sweep` reuses the SQLite cache, ensures FOUR_HOUR and ONE_DAY history for the current
universe plus BTC-USD, and evaluates the 12-combination grid of fee 60/40/10 bps, stop 2/3 ATR,
and partials on/off. It prints exit-reason counts and mean R plus a FOUR_HOUR/60 bps/3 ATR/partial
baseline table sorted by product P&L.

## API

- `GET /api/health`
- `GET /api/universe`
- `GET /api/scan`
- `GET /api/signals?limit=`
- `GET /api/positions`
- `GET /api/portfolio`
- `GET /api/settings`
- `PUT /api/settings`
- `POST /api/paper/reset`
- `GET /api/products/:id/candles?tf=`
- `GET /api/products/:id/analysis`
- `GET /api/backtest`
- `GET /api/backtest/:id`
- `GET /api/diagnostics/:id`

`GET /api/health` includes the current BTC market regime. `GET /api/scan` includes each product's
regime and market regime. The backtest report includes the percentage of sampled bars with a
bullish BTC market regime, so results are interpreted with their market-regime coverage.

## Results

The latest measured sample used the current 29-product ranked universe plus BTC-USD, 3000
FOUR_HOUR bars where available, and the latest 500 ONE_DAY bars for regime mapping. BTC-USD
covered 2025-05-08 through 2026-09-20; 1.15% of eligible configured-timeframe bars were
bullish-market bars. The FOUR_HOUR / 60 bps / stop 3 ATR / partial-on baseline produced 8 trades,
37.5% win rate, 2.356 profit factor, 0.237 expectancy R, 0.58% maximum drawdown, and +$187.00
net P&L. These are historical paper-backtest measurements over that specific cached Coinbase
sample, not predictions or guarantees of future performance.

Only public unauthenticated Coinbase market endpoints are used. Fetch failures are recorded per
product, exposed by `/api/health`, and shown as a dashboard warning; the application never
fabricates market data.
