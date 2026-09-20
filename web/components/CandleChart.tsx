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
      layout: { background: { type: ColorType.Solid, color: '#111827' }, textColor: '#9ca3af' },
      grid: { vertLines: { color: '#1f2937' }, horzLines: { color: '#1f2937' } },
    });
    const candlesSeries = chart.current.addCandlestickSeries({
      upColor: '#47e0a0',
      downColor: '#fb7185',
      borderVisible: false,
      wickUpColor: '#47e0a0',
      wickDownColor: '#fb7185',
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
    const colors = ['#f6c768', '#60a5fa', '#c084fc'];
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
