import { useEffect, useRef } from 'react';
import { ColorType, createChart, type IChartApi, type UTCTimestamp } from 'lightweight-charts';
import type { Candle } from '../../core/types';
import { priceFormat } from '../format';

interface Overlay {
  ema20: number[];
  ema50: number[];
  ema200: number[];
}

export function CandleChart({ candles, overlays }: { candles: Candle[]; overlays: Overlay }) {
  const element = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi>();
  useEffect(() => {
    if (!element.current) return;
    chart.current = createChart(element.current, {
      height: 420,
      layout: { background: { type: ColorType.Solid, color: '#17191c' }, textColor: '#9c9c96' },
      grid: { vertLines: { color: '#26292e' }, horzLines: { color: '#26292e' } },
    });
    const candlesSeries = chart.current.addCandlestickSeries({
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
      priceFormat: { type: 'price', ...priceFormat(candles.at(-1)?.close ?? 1) },
    });
    candlesSeries.setData(
      candles.map((candle) => ({
        time: candle.time as UTCTimestamp,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      })),
    );
    const colors = ['#f59e0b', '#9c9c96', '#ececea'];
    [overlays.ema20, overlays.ema50, overlays.ema200].forEach((values, seriesIndex) => {
      const line = chart.current?.addLineSeries({ color: colors[seriesIndex], lineWidth: 1 });
      line?.setData(
        candles
          .map((candle, index) => ({ time: candle.time as UTCTimestamp, value: values[index] }))
          .filter((point) => Number.isFinite(point.value)),
      );
    });
    return () => chart.current?.remove();
  }, [candles, overlays]);
  return <div className="chart large" ref={element} />;
}
