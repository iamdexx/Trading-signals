import { useEffect, useRef } from 'react';
import { ColorType, createChart, type IChartApi, type UTCTimestamp } from 'lightweight-charts';

interface EquityPoint {
  time: number;
  equity: number;
}

export function EquityChart({ points }: { points: EquityPoint[] }) {
  const element = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi>();
  useEffect(() => {
    if (!element.current) return;
    chart.current = createChart(element.current, {
      height: 240,
      layout: { background: { type: ColorType.Solid, color: '#111827' }, textColor: '#9ca3af' },
      grid: { vertLines: { color: '#1f2937' }, horzLines: { color: '#1f2937' } },
    });
    const series = chart.current.addLineSeries({ color: '#47e0a0', lineWidth: 2 });
    series.setData(
      points.map((point) => ({ time: point.time as UTCTimestamp, value: point.equity })),
    );
    return () => chart.current?.remove();
  }, [points]);
  return <div className="chart" ref={element} />;
}
