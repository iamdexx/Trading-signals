import { useState } from 'react';
import type { Settings as SettingsType } from '../../shared/api';

export function Settings({
  settings,
  onSave,
  onReset,
  staticMode = false,
}: {
  settings?: SettingsType;
  onSave: (settings: SettingsType) => Promise<void>;
  onReset: () => Promise<void>;
  staticMode?: boolean;
}) {
  const [draft, setDraft] = useState<SettingsType | undefined>(settings);
  if (!draft) return <section className="panel">Loading settings…</section>;

  const updateNumber = (key: keyof SettingsType, value: string) =>
    setDraft({ ...draft, [key]: Number(value) });
  const field = (key: keyof SettingsType, label: string, note?: string) => (
    <label key={key}>
      {label}{' '}
      <span
        className="info"
        title={note ?? 'This setting changes how the dashboard calculates results.'}
      >
        ⓘ
      </span>
      {note && <small>{note}</small>}
      <input
        type="number"
        step="any"
        value={Number(draft[key])}
        readOnly={staticMode}
        onChange={(event) => updateNumber(key, event.target.value)}
      />
    </label>
  );
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
      <p className="eyebrow">SETTINGS</p>
      <h1>Make it work for you</h1>
      <p className="muted">
        These choices change the examples and recommendations you see. No trades are placed
        automatically.
      </p>

      <h2>Basics</h2>
      <label>
        Portfolio mode{' '}
        <span
          className="info"
          title="Manual mode records your real trades; paper mode simulates them."
        >
          ⓘ
        </span>
        <small>Manual mode tracks trades you enter. Paper mode simulates a strategy.</small>
        <select
          value={draft.mode}
          disabled={staticMode}
          onChange={(event) =>
            setDraft({ ...draft, mode: event.target.value as SettingsType['mode'] })
          }
        >
          <option value="manual">My real trades</option>
          <option value="paper">Practice account</option>
        </select>
      </label>
      <div className="settings-grid">
        {field('startingEquity', 'Starting money', 'The amount your account began with.')}
        {field(
          'fixedUsdPerTrade',
          'Money per trade',
          'The usual dollar amount used for one practice trade.',
        )}
        {field(
          'riskPerTrade',
          'Money risked per trade',
          'The share of an account that can be lost on one practice trade.',
        )}
        {field(
          'maxPositions',
          'Max coins held at once',
          'The most practice positions open at one time.',
        )}
        {field('universeSize', 'Coins watched', 'How many coins are included in the watchlist.')}
      </div>

      <details>
        <summary>Advanced</summary>
        <div className="settings-grid">
          {field(
            'maxNotionalPct',
            'Max trade size',
            'The largest share of the account used by one practice trade.',
          )}
          {field('stopAtrMult', 'Safety exit distance', 'Initial safety exit (ATR stop) distance.')}
          {field('targetR', 'Profit target', 'The first profit target (R multiple).')}
          {field(
            'trailAtrMult',
            'Moving safety exit',
            'The distance of the moving safety exit (trailing ATR).',
          )}
          {field(
            'newsBlockHours',
            'Bad-news waiting time',
            'Hours to wait after a hack, delisting, or lawsuit.',
          )}
          <label>
            Fee %{' '}
            <span
              className="info"
              title="Trading fee used in calculations (stored internally as basis points)."
            >
              ⓘ
            </span>
            <small>Still stored precisely for the strategy.</small>
            <input
              type="number"
              step="0.01"
              value={(draft.feeBps / 100).toFixed(2)}
              readOnly={staticMode}
              onChange={(event) => setDraft({ ...draft, feeBps: Number(event.target.value) * 100 })}
            />
          </label>
          <label>
            Slippage %{' '}
            <span className="info" title="A small allowance for price movement during a trade.">
              ⓘ
            </span>
            <input
              type="number"
              step="0.01"
              value={(draft.slippageBps / 100).toFixed(2)}
              readOnly={staticMode}
              onChange={(event) =>
                setDraft({ ...draft, slippageBps: Number(event.target.value) * 100 })
              }
            />
          </label>
          <label>
            Fee plan
            <select
              value={feePreset}
              disabled={staticMode}
              onChange={(event) => {
                const values: Record<string, number> = {
                  'coinbase-taker': 60,
                  maker: 40,
                  'coinbase-one': 0,
                };
                if (values[event.target.value] !== undefined)
                  setDraft({ ...draft, feeBps: values[event.target.value] });
              }}
            >
              <option value="coinbase-taker">Coinbase Advanced taker</option>
              <option value="maker">Maker</option>
              <option value="coinbase-one">Coinbase One</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          <label>
            Chart speed{' '}
            <span className="info" title="How often each chart candle covers (timeframe).">
              ⓘ
            </span>
            <select
              value={draft.timeframe}
              disabled={staticMode}
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
              checked={draft.newsEnabled}
              disabled={staticMode}
              onChange={(event) => setDraft({ ...draft, newsEnabled: event.target.checked })}
            />
            Use live news
            <small>
              News adds context to live recommendations; history tests remain technical.
            </small>
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={draft.partialEnabled}
              disabled={staticMode}
              onChange={(event) => setDraft({ ...draft, partialEnabled: event.target.checked })}
            />
            Take some profit early
            <small>Sell part at the first target, then use the moving safety exit.</small>
          </label>
        </div>
      </details>

      {staticMode ? (
        <div className="warning">
          This dashboard is read-only here. Edit <code>config/settings.json</code> on main and run
          the{' '}
          <a href="https://github.com/iamdexx/Trading-signals/actions/workflows/tick.yml">
            Paper tick workflow
          </a>
          .
          {draft.mode === 'manual' && (
            <> Real trades are logged through My Portfolio or the GitHub issue form.</>
          )}
        </div>
      ) : (
        <div className="settings-actions">
          <button className="primary" onClick={() => void onSave(draft)}>
            Save settings
          </button>
          <button
            className="danger"
            onClick={() => {
              if (window.confirm('Reset the practice account and delete its positions and calls?'))
                void onReset();
            }}
          >
            Reset practice account
          </button>
        </div>
      )}
      <p className="muted">Account started {new Date(draft.startDate).toLocaleString()}</p>
    </section>
  );
}
