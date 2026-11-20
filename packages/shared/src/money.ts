// Exact money calculations in piasters (1/100 pound), so no rounding errors (idea 3 of the database design)

export function toPiasters(money: string): number {
  const [pounds, fraction = ''] = money.split('.');
  return Number(pounds) * 100 + Number((fraction + '00').slice(0, 2));
}

export function fromPiasters(p: number): string {
  const sign = p < 0 ? '-' : '';
  const abs = Math.abs(Math.round(p));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

// Price after a percent discount, rounded to the nearest piaster
export function applyDiscount(price: string, percent: string): string {
  return fromPiasters(Math.round((toPiasters(price) * (10000 - toPiasters(percent))) / 10000));
}

// Free units for a bonus offer: "buy 10, get 1" on 25 units gives 2
export function bonusUnits(quantity: number, buy: number, free: number): number {
  if (buy <= 0) return 0;
  return Math.floor(quantity / buy) * free;
}
