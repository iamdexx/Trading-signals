import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { appendLedgerEntry, ledgerEntries, universe } from '../server/db.js';
import { ledgerWarnings, validateEntry } from '../core/ledger.js';
import type { LedgerEntry, LedgerEntryType } from '../core/ledger.js';
import type { AnalysisResponse, Heartbeat } from '../shared/api.js';
import { exportState, getSettings, importState, resetPaper, saveSettings } from '../server/db.js';
import type { BacktestReport } from '../core/types.js';

process.env.RUN_SERVER = 'false';
const runtime = await import('../server/index.js');
const handlers = await import('../server/handlers.js');

const stateDirectory = path.resolve(process.env.STATE_DIR ?? 'state');
const outputDirectory = path.resolve(process.env.OUT_DIR ?? 'snapshot');
const startedAt = Date.now();
let heartbeat: Heartbeat = {
  startedAt,
  finishedAt: 0,
  durationMs: 0,
  ok: false,
  errors: [],
  productsLoaded: 0,
  timeframe: getSettings().timeframe,
  intervalMinutes: 60,
  nextExpectedAt: startedAt + 60 * 60 * 1000,
};

function writeJson(relativePath: string, value: unknown): void {
  const target = path.join(outputDirectory, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value)}\n`);
}

function saveHeartbeat(): void {
  runtime.setHeartbeat(heartbeat);
  writeJson('heartbeat.json', heartbeat);
}

function issueFields(body: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const match of body.matchAll(/###\s+([^\n]+)\n+([\s\S]*?)(?=\n###\s+|\s*$)/gi)) {
    const key = match[1]
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');
    fields[key] = match[2].trim().split('\n')[0].trim();
  }
  return fields;
}

function parseLedgerIssue(body: string, issueNumber?: string): LedgerEntry | string {
  const fields = issueFields(body);
  const type = fields.type?.toLowerCase() as LedgerEntryType | undefined;
  if (!type || !['deposit', 'withdrawal', 'buy', 'sell'].includes(type)) {
    return 'type must be deposit, withdrawal, buy, or sell';
  }
  const productId = fields.product?.trim().toUpperCase();
  const quantity = fields.quantity ? Number(fields.quantity) : undefined;
  const price = fields.price ? Number(fields.price) : undefined;
  const feeUsd = fields.feeusd ? Number(fields.feeusd) : 0;
  const timestamp = fields.timestamp ? Date.parse(fields.timestamp) : Date.now();
  if (fields.timestamp && !Number.isFinite(timestamp)) return 'timestamp must be ISO or blank';
  if (fields.quantity && !Number.isFinite(quantity)) return 'quantity must be numeric';
  if (fields.price && !Number.isFinite(price)) return 'price must be numeric';
  if (fields.feeusd && !Number.isFinite(feeUsd)) return 'fee must be numeric';
  return {
    id: issueNumber ? `issue-${issueNumber}` : `issue-${Date.now()}`,
    type,
    ...(productId ? { productId } : {}),
    ...(quantity === undefined ? {} : { quantity }),
    ...(price === undefined ? {} : { price }),
    feeUsd,
    timestamp,
    ...(fields.note ? { note: fields.note } : {}),
    source: 'issue',
    ...(issueNumber ? { ref: issueNumber } : {}),
  };
}

function trimAnalysis(result: AnalysisResponse): AnalysisResponse {
  const start = Math.max(0, result.candles.length - 500);
  return {
    ...result,
    candles: result.candles.slice(start),
    indicators: {
      ema20: result.indicators.ema20.slice(start),
      ema50: result.indicators.ema50.slice(start),
      ema200: result.indicators.ema200.slice(start),
      rsi: result.indicators.rsi.slice(start),
      macd: result.indicators.macd.slice(start),
      adx: result.indicators.adx.slice(start),
      atrPct: result.indicators.atrPct.slice(start),
    },
    backtest: snapshotBacktest(result.backtest),
  };
}

function downsampleCurve(curve: BacktestReport['equityCurve']): BacktestReport['equityCurve'] {
  if (curve.length <= 600) {
    return curve;
  }
  return Array.from({ length: 600 }, (_, index) => {
    const sourceIndex = Math.round((index * (curve.length - 1)) / 599);
    return curve[sourceIndex];
  });
}

function snapshotBacktest(report: BacktestReport, combined = false): BacktestReport {
  const perProduct = report.perProduct
    ? Object.fromEntries(
        Object.entries(report.perProduct).map(([productId, productReport]) => [
          productId,
          combined
            ? { ...productReport, trades: [], equityCurve: [] }
            : snapshotBacktest(productReport),
        ]),
      )
    : undefined;
  return {
    ...report,
    trades: report.trades,
    equityCurve: downsampleCurve(report.equityCurve),
    ...(perProduct ? { perProduct } : {}),
  };
}

try {
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.mkdirSync(stateDirectory, { recursive: true });
  saveHeartbeat();

  const statePath = path.join(stateDirectory, 'state.json');
  if (fs.existsSync(statePath)) {
    importState(JSON.parse(fs.readFileSync(statePath, 'utf8')));
  }
  const settingsPath = path.resolve('config/settings.json');
  if (fs.existsSync(settingsPath)) {
    saveSettings(JSON.parse(fs.readFileSync(settingsPath, 'utf8')));
  }
  if (process.env.RESET_PAPER === '1' || process.env.RESET_PAPER === 'true') {
    resetPaper();
  }
  let ledgerResult: {
    accepted: boolean;
    error?: string;
    entry?: LedgerEntry;
    warnings?: string[];
  } = {
    accepted: false,
  };
  if (process.env.LEDGER_ISSUE_BODY) {
    const parsed = parseLedgerIssue(process.env.LEDGER_ISSUE_BODY, process.env.LEDGER_ISSUE_NUMBER);
    if (typeof parsed === 'string') {
      ledgerResult = { accepted: false, error: parsed };
    } else {
      const error = validateEntry(parsed, ledgerEntries());
      if (error) {
        ledgerResult = { accepted: false, error };
      } else {
        appendLedgerEntry(parsed);
        ledgerResult = {
          accepted: true,
          entry: parsed,
          warnings: ledgerWarnings(
            parsed,
            universe().map((product) => product.product_id),
          ),
        };
      }
    }
  }
  writeJson('ledger-result.json', ledgerResult);

  const refresh = await runtime.refreshUniverse();
  if (refresh.products === 0 || refresh.failures > refresh.products / 2) {
    throw new Error(
      `Candle refresh failed for ${refresh.failures}/${refresh.products || 'all'} products`,
    );
  }
  await runtime.paperTick();

  const products = handlers.universeResponse();
  const runtimeHeartbeat = runtime.handlerContext.heartbeat();
  heartbeat = {
    ...runtimeHeartbeat,
    startedAt,
    finishedAt: Date.now(),
    durationMs: Date.now() - startedAt,
    ok: runtimeHeartbeat.ok,
    errors: runtimeHeartbeat.errors,
    productsLoaded: products.filter((product) => product.historyStatus === 'ready').length,
    timeframe: getSettings().timeframe,
    intervalMinutes: 60,
    nextExpectedAt: Date.now() + 60 * 60 * 1000,
  };
  runtime.setHeartbeat(heartbeat);

  writeJson('state/state.json', exportState());
  writeJson('api/health.json', handlers.healthResponse(runtime.handlerContext));
  writeJson('api/settings.json', getSettings());
  writeJson('api/universe.json', handlers.universeResponse());
  writeJson('api/scan.json', handlers.scanResponse(runtime.handlerContext));
  writeJson('api/portfolio.json', handlers.portfolioResponse());
  writeJson('api/positions.json', handlers.positionsResponse(runtime.handlerContext));
  writeJson('api/ledger.json', handlers.ledgerResponse());
  writeJson('api/signals.json', handlers.signalsResponse(200));
  writeJson('api/news.json', handlers.newsResponse(undefined, 200));
  writeJson('api/news-summary.json', handlers.newsSummaryResponse());
  writeJson(
    'api/backtest.json',
    snapshotBacktest(handlers.backtestResponse(runtime.handlerContext), true),
  );

  for (const product of products) {
    const productId = product.product_id;
    const analysis = handlers.analysisResponse(runtime.handlerContext, productId);
    if (!('error' in analysis)) {
      writeJson(`api/products/${productId}/analysis.json`, trimAnalysis(analysis));
    }
    writeJson(`api/products/${productId}/news.json`, handlers.newsResponse(productId, 10));
    const backtest = snapshotBacktest(handlers.backtestResponse(runtime.handlerContext, productId));
    writeJson(`api/backtest/${productId}.json`, backtest);
    const diagnostics = handlers.diagnosticsResponse(runtime.handlerContext, productId);
    writeJson(`api/diagnostics/${productId}.json`, diagnostics);
  }
  saveHeartbeat();
} catch (error) {
  heartbeat = {
    ...heartbeat,
    finishedAt: Date.now(),
    durationMs: Date.now() - startedAt,
    ok: false,
    errors: [error instanceof Error ? error.message : String(error)],
  };
  try {
    saveHeartbeat();
  } catch {
    // Preserve the original tick failure if the output directory is unavailable.
  }
  process.exitCode = 1;
}
