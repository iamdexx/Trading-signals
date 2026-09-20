import { useState } from 'react';
import type { LedgerEntry, LedgerPortfolio } from '../../shared/api';
import { postLedger, staticMode } from '../api';

function issueUrl(type: 'deposit' | 'buy', product?: string): string {
  const params = new URLSearchParams({
    template: 'ledger.yml',
    title: type === 'deposit' ? 'Ledger deposit' : `Log ${product ?? 'crypto'} trade`,
    type,
  });
  if (product) params.set('product', product);
  return `https://github.com/iamdexx/Trading-signals/issues/new?${params}`;
}

export function Ledger({
  entries,
  portfolio,
  product,
  onSelect,
}: {
  entries: LedgerEntry[];
  portfolio?: LedgerPortfolio;
  product?: string;
  onSelect?: (productId: string) => void;
}) {
  const [type, setType] = useState<LedgerEntry['type']>('buy');
  const [productId, setProductId] = useState(product ?? '');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [feeUsd, setFeeUsd] = useState('0');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const submit = async () => {
    try {
      await postLedger({
        id: `api-${Date.now()}`,
        type,
        ...(productId ? { productId } : {}),
        ...(quantity ? { quantity: Number(quantity) } : {}),
        price: Number(price),
        feeUsd: Number(feeUsd),
        timestamp: Date.now(),
        ...(note ? { note } : {}),
      });
      setMessage('Entry saved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };
  const startEntry = (nextType: LedgerEntry['type']) => {
    if (staticMode) {
      window.open(issueUrl(nextType === 'deposit' ? 'deposit' : 'buy', product), '_blank');
      return;
    }
    setType(nextType);
  };
  return (
    <>
      <div className="section-title">
        <div>
          <p className="eyebrow">MY PORTFOLIO</p>
          <h1>What you own</h1>
        </div>
        <div className="settings-actions">
          <button className="primary" onClick={() => startEntry('deposit')}>
            Add deposit
          </button>
          <button className="primary" onClick={() => startEntry('buy')}>
            Log trade
          </button>
        </div>
      </div>
      {portfolio && (
        <section className="cards">
          {[
            ['CASH', portfolio.cash],
            [
              'COINS VALUE',
              portfolio.holdings.reduce((sum, holding) => sum + holding.marketValue, 0),
            ],
            ['TOTAL VALUE', portfolio.equity],
            ['LOCKED-IN GAIN/LOSS', portfolio.realizedPnl],
            [
              'OPEN GAIN/LOSS',
              portfolio.holdings.reduce((sum, holding) => sum + holding.unrealizedPnl, 0),
            ],
            ['FEES PAID', portfolio.feesPaid],
            ['MONEY ADDED', portfolio.deposits],
          ].map(([label, value]) => (
            <div className="metric panel" key={String(label)}>
              <small>{label}</small>
              <strong>${Number(value).toFixed(2)}</strong>
            </div>
          ))}
        </section>
      )}
      {!staticMode && (
        <section className="panel">
          <h2>Add a trade or money</h2>
          <div className="settings-grid">
            <label>
              Type
              <select
                value={type}
                onChange={(event) => setType(event.target.value as LedgerEntry['type'])}
              >
                <option value="buy">Buy</option>
                <option value="sell">Sell</option>
                <option value="deposit">Deposit</option>
                <option value="withdrawal">Withdrawal</option>
              </select>
            </label>
            <label>
              Product
              <input
                value={productId}
                onChange={(event) => setProductId(event.target.value.toUpperCase())}
              />
            </label>
            <label>
              Quantity
              <input value={quantity} onChange={(event) => setQuantity(event.target.value)} />
            </label>
            <label>
              Price / USD amount
              <input value={price} onChange={(event) => setPrice(event.target.value)} />
            </label>
            <label>
              Fee USD
              <input value={feeUsd} onChange={(event) => setFeeUsd(event.target.value)} />
            </label>
            <label>
              Note
              <input value={note} onChange={(event) => setNote(event.target.value)} />
            </label>
          </div>
          <button className="primary" onClick={() => void submit()}>
            Save entry
          </button>
          {message && <p className="muted">{message}</p>}
        </section>
      )}
      <section className="panel">
        <h2>What you own</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>COIN</th>
                <th>QTY</th>
                <th>AVERAGE COST</th>
                <th>COINS VALUE</th>
                <th>OPEN GAIN/LOSS</th>
              </tr>
            </thead>
            <tbody>
              {(portfolio?.holdings ?? []).map((holding) => (
                <tr key={holding.productId} onClick={() => onSelect?.(holding.productId)}>
                  <td className="coin">{holding.productId}</td>
                  <td>{holding.quantity.toFixed(8)}</td>
                  <td>${holding.avgCost.toFixed(2)}</td>
                  <td>${holding.marketValue.toFixed(2)}</td>
                  <td className={holding.unrealizedPnl >= 0 ? 'buy' : 'sell'}>
                    ${holding.unrealizedPnl.toFixed(2)} ({holding.unrealizedPct.toFixed(2)}%)
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <h2>Trade history</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>WHEN</th>
                <th>TYPE</th>
                <th>COIN</th>
                <th>QTY</th>
                <th>PRICE / USD</th>
                <th>FEE</th>
                <th>NOTE</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td>{new Date(entry.timestamp).toLocaleString()}</td>
                  <td>{entry.type}</td>
                  <td>{entry.productId ?? 'USD'}</td>
                  <td>{entry.quantity ?? '—'}</td>
                  <td>${(entry.price ?? 0).toFixed(2)}</td>
                  <td>${entry.feeUsd.toFixed(2)}</td>
                  <td>{entry.note ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
