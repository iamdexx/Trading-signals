import { fee, fillPrice } from './strategy.js';
import type { StrategyConfig } from './types.js';

export function entryFill(rawPrice: number, config: StrategyConfig): number {
  return fillPrice(rawPrice, 'BUY', config.slippageBps);
}

export function entryFee(rawPrice: number, quantity: number, config: StrategyConfig): number {
  return fee(entryFill(rawPrice, config) * quantity, config.feeBps);
}

export function exitLegPnl(
  entryFillPrice: number,
  rawExitPrice: number,
  quantity: number,
  config: StrategyConfig,
): number {
  const exitFillPrice = fillPrice(rawExitPrice, 'SELL', config.slippageBps);
  const exitFee = fee(exitFillPrice * quantity, config.feeBps);
  return (exitFillPrice - entryFillPrice) * quantity - exitFee;
}

export function unrealizedPnl(
  entryFillPrice: number,
  currentRawPrice: number,
  remainingQuantity: number,
  config: StrategyConfig,
): number {
  return exitLegPnl(entryFillPrice, currentRawPrice, remainingQuantity, config);
}
