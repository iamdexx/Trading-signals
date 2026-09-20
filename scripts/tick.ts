import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import type { AnalysisResponse, Heartbeat } from '../shared/api.js';
import { exportState, getSettings, importState, resetPaper, saveSettings } from '../server/db.js';

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
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
}

function saveHeartbeat(): void {
  runtime.setHeartbeat(heartbeat);
  writeJson('heartbeat.json', heartbeat);
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
  writeJson('api/positions.json', handlers.positionsResponse());
  writeJson('api/signals.json', handlers.signalsResponse(200));
  writeJson('api/news.json', handlers.newsResponse(undefined, 200));
  writeJson('api/news-summary.json', handlers.newsSummaryResponse());
  writeJson('api/backtest.json', handlers.backtestResponse(runtime.handlerContext));

  for (const product of products) {
    const productId = product.product_id;
    const analysis = handlers.analysisResponse(runtime.handlerContext, productId);
    if (!('error' in analysis)) {
      writeJson(`api/products/${productId}/analysis.json`, trimAnalysis(analysis));
    }
    writeJson(`api/products/${productId}/news.json`, handlers.newsResponse(productId, 10));
    const backtest = handlers.backtestResponse(runtime.handlerContext, productId);
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
