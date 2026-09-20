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
      layout: { background: { type: ColorType.Solid, color: '#17191c' }, textColor: '#9c9c96' },
      grid: { vertLines: { color: '#26292e' }, horzLines: { color: '#26292e' } },
    });
    const series = chart.current.addLineSeries({ color: '#22c55e', lineWidth: 2 });
    series.setData(
      points.map((point) => ({ time: point.time as UTCTimestamp, value: point.equity })),
    );
    return () => chart.current?.remove();
  }, [points]);
  return <div className="chart" ref={element} />;
}
