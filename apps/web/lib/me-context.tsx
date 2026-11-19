'use client';

import { createContext, useContext } from 'react';
import type { Me } from './api';

export const MeContext = createContext<{ me: Me; reloadMe: () => Promise<void> } | null>(null);

export function useMe() {
  const v = useContext(MeContext);
  if (!v) throw new Error('useMe outside the app layout');
  return v;
}

export const isOwner = (me: Me) => me.roles.includes('owner');
export const hasAnyRole = (me: Me, ...roles: string[]) => isOwner(me) || me.roles.some((r) => roles.includes(r));
