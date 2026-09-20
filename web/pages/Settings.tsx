import { useState } from 'react';
import type { Settings as SettingsType } from '../../shared/api';

export function Settings({
  settings,
  onSave,
  onReset,
}: {
  settings?: SettingsType;
  onSave: (settings: SettingsType) => Promise<void>;
  onReset: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<SettingsType | undefined>(settings);
  if (!draft) return <section className="panel">Loading settings…</section>;
  const updateNumber = (key: keyof SettingsType, value: string) =>
    setDraft({ ...draft, [key]: Number(value) });
  const feePreset =
    draft.feeBps === 60
      ? 'coinbase-taker'
      : draft.feeBps === 40
        ? 'maker'
        : draft.feeBps === 0
          ? 'coinbase-one'
          : 'custom';
  return (
    <section className="panel settings">
      <p className="eyebrow">CONFIGURATION</p>
      <h1>Settings</h1>
      <div className="settings-grid">
        {(
          [
            ['startingEquity', 'Starting equity'],
            ['riskPerTrade', 'Risk per trade'],
            ['fixedUsdPerTrade', 'Fixed USD per trade'],
            ['maxPositions', 'Max positions'],
            ['maxNotionalPct', 'Max notional fraction'],
            ['feeBps', 'Fee (bps)'],
            ['slippageBps', 'Slippage (bps)'],
            ['universeSize', 'Universe size'],
            ['stopAtrMult', 'Stop ATR multiple'],
            ['targetR', 'Target R'],
            ['trailAtrMult', 'Trail ATR multiple'],
          ] as Array<[keyof SettingsType, string]>
        ).map(([key, label]) => (
          <label key={key}>
            {label}
            {key === 'stopAtrMult' && (
              <small className="muted">Initial stop distance in ATRs.</small>
            )}
            {key === 'targetR' && (
              <small className="muted">Partial target measured in initial R.</small>
            )}
            {key === 'trailAtrMult' && (
              <small className="muted">Chandelier trail distance in ATRs.</small>
            )}
            <input
              type="number"
              step="any"
              value={Number(draft[key])}
              onChange={(event) => updateNumber(key, event.target.value)}
            />
          </label>
        ))}
        <label>
          Fee preset
          <small className="muted">Choose a venue tier or keep a custom fee below.</small>
          <select
            value={feePreset}
            onChange={(event) => {
              const values: Record<string, number> = {
                'coinbase-taker': 60,
                maker: 40,
                'coinbase-one': 0,
              };
              const value = values[event.target.value];
              if (value !== undefined) {
                setDraft({ ...draft, feeBps: value });
              }
            }}
          >
            <option value="coinbase-taker">Coinbase Advanced taker · 60 bps</option>
            <option value="maker">Coinbase Advanced maker · 40 bps</option>
            <option value="coinbase-one">Coinbase One fee tier · 0 bps</option>
            <option value="custom">Custom</option>
          </select>
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={draft.newsEnabled}
            onChange={(event) => setDraft({ ...draft, newsEnabled: event.target.checked })}
          />
          Enable live news overlay
          <small className="muted">
            Adds sentiment to live scans; historical backtests stay technical.
          </small>
        </label>
        <label>
          News block hours
          <small className="muted">
            Block live entries after hack, delisting, or lawsuit catalysts.
          </small>
          <input
            type="number"
            min="1"
            value={draft.newsBlockHours}
            onChange={(event) => updateNumber('newsBlockHours', event.target.value)}
          />
        </label>
        <label>
          Sizing mode
          <select
            value={draft.sizingMode}
            onChange={(event) =>
              setDraft({
                ...draft,
                sizingMode: event.target.value as SettingsType['sizingMode'],
              })
            }
          >
            <option value="risk_pct">Risk percentage</option>
            <option value="fixed_usd">Fixed USD</option>
          </select>
        </label>
        <label>
          Timeframe
          <select
            value={draft.timeframe}
            onChange={(event) => setDraft({ ...draft, timeframe: event.target.value })}
          >
            <option value="ONE_HOUR">1 hour</option>
            <option value="FOUR_HOUR">4 hours</option>
            <option value="ONE_DAY">1 day</option>
          </select>
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={draft.partialEnabled}
            onChange={(event) => setDraft({ ...draft, partialEnabled: event.target.checked })}
          />
          Enable 1.5R partial target
          <small className="muted">Sell half at target R, then trail the remainder.</small>
        </label>
      </div>
      <div className="settings-actions">
        <button className="primary" onClick={() => void onSave(draft)}>
          Save settings
        </button>
        <button
          className="danger"
          onClick={() => {
            if (window.confirm('Reset the paper account and delete all positions and signals?')) {
              void onReset();
            }
          }}
        >
          Reset paper account
        </button>
      </div>
      <p className="muted">Paper account start: {new Date(draft.startDate).toLocaleString()}</p>
    </section>
  );
}
