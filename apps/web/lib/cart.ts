'use client';

import { useCallback, useEffect, useState } from 'react';

// The cart lives on the phone, so it survives closing the app (CUS-05).
// It holds only choices. Every price is calculated by the backend.
export interface CartLine {
  productId: string;
  nameAr: string;
  nameEn: string;
  quantity: number;
  mustHave: boolean;
}
export interface Cart {
  customerId?: string;
  paymentChoice: 'on_arrival' | 'credit';
  lines: CartLine[];
}

const EMPTY: Cart = { paymentChoice: 'on_arrival', lines: [] };
const key = (userId: string) => `cosmo.cart.${userId}`;
const EVENT = 'cosmo-cart-changed';

function read(userId: string): Cart {
  try {
    const raw = localStorage.getItem(key(userId));
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as Cart) } : EMPTY;
  } catch {
    return EMPTY;
  }
}

export function useCart(userId: string) {
  const [cart, setCart] = useState<Cart>(EMPTY);

  useEffect(() => {
    setCart(read(userId));
    const sync = () => setCart(read(userId));
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, [userId]);

  const save = useCallback(
    (next: Cart) => {
      setCart(next);
      try {
        localStorage.setItem(key(userId), JSON.stringify(next));
      } catch {}
      window.dispatchEvent(new Event(EVENT));
    },
    [userId],
  );

  const add = (p: { id: string; nameAr: string; nameEn: string }, quantity = 1) => {
    const current = read(userId);
    const existing = current.lines.find((l) => l.productId === p.id);
    const lines = existing
      ? current.lines.map((l) => (l.productId === p.id ? { ...l, quantity: l.quantity + quantity } : l))
      : [...current.lines, { productId: p.id, nameAr: p.nameAr, nameEn: p.nameEn, quantity, mustHave: false }];
    save({ ...current, lines });
  };

  return { cart, save, add, clear: () => save({ ...EMPTY, customerId: undefined }) };
}
