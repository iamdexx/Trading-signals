export function formatPrice(value: number): string {
  if (!Number.isFinite(value)) {
    return '—';
  }
  return value.toLocaleString(undefined, {
    maximumSignificantDigits: 8,
    minimumSignificantDigits: value > 0 && value < 1 ? 2 : undefined,
  });
}

export function priceFormat(value: number): { precision: number; minMove: number } {
  const magnitude = Math.abs(value);
  if (!magnitude || !Number.isFinite(magnitude)) {
    return { precision: 2, minMove: 0.01 };
  }
  const precision = Math.max(2, Math.ceil(-Math.log10(magnitude)) + 4);
  return { precision, minMove: 10 ** -precision };
}
