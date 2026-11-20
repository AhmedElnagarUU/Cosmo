'use client';

import { useEffect, useState } from 'react';
import { get } from '@/lib/api';
import { useName, type Named } from '@/lib/catalog';

export interface PickedProduct extends Named {
  id: string;
  trackBatches?: boolean;
  costPrice?: string;
  barcode: string | null;
  packSize: string;
}

// Search a product by name, barcode, or active ingredient, then pick it
export function ProductPicker({ placeholder, onPick }: { placeholder: string; onPick: (p: PickedProduct) => void }) {
  const name = useName();
  const [q, setQ] = useState('');
  const [items, setItems] = useState<PickedProduct[]>([]);

  useEffect(() => {
    if (!q.trim()) {
      setItems([]);
      return;
    }
    const id = setTimeout(() => {
      get<{ items: PickedProduct[] }>(`/products?limit=8&q=${encodeURIComponent(q)}`)
        .then((r) => setItems(r.items))
        .catch(() => setItems([]));
    }, 250);
    return () => clearTimeout(id);
  }, [q]);

  return (
    <div className="relative">
      <input className="field" type="search" placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} />
      {items.length > 0 && (
        <ul className="card absolute inset-x-0 z-10 mt-1 max-h-72 overflow-y-auto shadow-lg">
          {items.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-start hover:bg-black/5"
                onClick={() => {
                  onPick(p);
                  setQ('');
                  setItems([]);
                }}
              >
                <div className="font-medium">{name(p)}</div>
                <div className="muted text-xs">
                  {p.packSize}
                  {p.barcode && <span dir="ltr"> · {p.barcode}</span>}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
