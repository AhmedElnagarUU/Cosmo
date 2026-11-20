'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { ApiError, get, post, type Me } from '@/lib/api';
import { MeContext, hasAnyRole, isOwner } from '@/lib/me-context';
import { Loading } from '@/components/ui';
import { LanguageSwitch } from '@/components/language-switch';

// Every screen after login. Loads who is logged in and shows the menu for their roles (C-64).
// Hidden menu items are only for comfort. The backend checks every request again.
export default function AppLayout({ children }: { children: ReactNode }) {
  const t = useTranslations('nav');
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [unread, setUnread] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  const reloadMe = useCallback(async () => {
    try {
      const m = await get<Me>('/me');
      if (m.mustChangePassword) return router.replace('/change-password');
      setMe(m);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) router.replace('/');
    }
  }, [router]);

  useEffect(() => {
    void reloadMe();
  }, [reloadMe]);

  // New notifications every 30 seconds (docs/technical/02-api-design.md)
  useEffect(() => {
    if (!me) return;
    const check = () =>
      get<{ unread: number }>('/notifications?limit=1')
        .then((r) => setUnread(r.unread))
        .catch(() => {});
    void check();
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, [me, pathname]);

  useEffect(() => setMenuOpen(false), [pathname]);

  if (!me) return <Loading />;

  const items: Array<{ href: string; label: string; show: boolean; badge?: number }> = [
    { href: '/app', label: t('home'), show: true },
    { href: '/app/catalog', label: t('catalog'), show: me.userType === 'customer' },
    { href: '/app/cart', label: t('cart'), show: me.userType === 'customer' || hasAnyRole(me, 'sales') },
    { href: '/app/orders', label: me.userType === 'customer' ? t('myOrders') : t('orders'), show: me.userType === 'customer' || hasAnyRole(me, 'sales', 'stock_manager', 'delivery_manager', 'accountant') },
    { href: '/app/delivery', label: t('delivery'), show: me.userType === 'employee' && hasAnyRole(me, 'delivery_manager') },
    { href: '/app/my-trips', label: t('myTrips'), show: me.userType === 'employee' && me.roles.includes('delivery') },
    { href: '/app/goods-back', label: t('goodsBack'), show: me.userType === 'employee' && hasAnyRole(me, 'stock_manager') },
    { href: '/app/payments', label: t('payments'), show: me.userType === 'employee' && hasAnyRole(me, 'accountant') },
    { href: '/app/invoices', label: t('invoices'), show: me.userType === 'customer' || hasAnyRole(me, 'accountant', 'sales') },
    { href: '/app/balances', label: t('balances'), show: me.userType === 'employee' && hasAnyRole(me, 'accountant', 'sales') },
    { href: '/app/statement', label: t('statement'), show: me.userType === 'customer' },
    { href: '/app/returns', label: t('returns'), show: me.userType === 'customer' || hasAnyRole(me, 'sales', 'stock_manager', 'accountant') },
    { href: '/app/products', label: t('products'), show: me.userType === 'employee' && hasAnyRole(me, 'stock_manager', 'sales', 'accountant') },
    { href: '/app/stock', label: t('stock'), show: me.userType === 'employee' && hasAnyRole(me, 'stock_manager') },
    { href: '/app/lists', label: t('lists'), show: me.userType === 'employee' && hasAnyRole(me, 'stock_manager') },
    { href: '/app/extra-fields', label: t('extraFields'), show: me.userType === 'employee' && isOwner(me) },
    { href: '/app/receipts', label: t('receipts'), show: me.userType === 'employee' && hasAnyRole(me, 'stock_manager', 'accountant') },
    { href: '/app/supplier-returns', label: t('supplierReturns'), show: me.userType === 'employee' && hasAnyRole(me, 'stock_manager', 'accountant') },
    { href: '/app/suppliers', label: t('suppliers'), show: me.userType === 'employee' && hasAnyRole(me, 'stock_manager', 'accountant') },
    { href: '/app/customers', label: t('customers'), show: me.userType === 'employee' && hasAnyRole(me, 'sales', 'accountant', 'delivery_manager') },
    { href: '/app/resets', label: t('resets'), show: me.userType === 'employee' && hasAnyRole(me, 'sales') },
    { href: '/app/employees', label: t('employees'), show: me.userType === 'employee' && isOwner(me) },
    { href: '/app/settings', label: t('settings'), show: me.userType === 'employee' && isOwner(me) },
    { href: '/app/profile', label: t('profile'), show: me.userType === 'customer' },
    { href: '/app/notifications', label: t('notifications'), show: true, badge: unread },
  ];

  async function logout() {
    await post('/auth/logout').catch(() => {});
    router.replace(`/login/${me!.wholesaler.loginCode}`);
  }

  const nav = (
    <nav className="flex flex-col gap-1">
      {items
        .filter((i) => i.show)
        .map((i) => {
          const active = i.href === '/app' ? pathname === '/app' : pathname.startsWith(i.href);
          return (
            <Link
              key={i.href}
              href={i.href}
              className={`flex items-center justify-between rounded-lg px-3 py-2 ${active ? 'bg-teal-50 font-semibold text-teal-800 dark:bg-teal-950 dark:text-teal-100' : 'hover:bg-black/5'}`}
            >
              <span>{i.label}</span>
              {!!i.badge && <span className="rounded-full bg-red-600 px-2 text-xs text-white">{i.badge}</span>}
            </Link>
          );
        })}
      <hr className="my-2 border-[var(--line)]" />
      <Link href="/change-password" className="rounded-lg px-3 py-2 hover:bg-black/5">
        {t('changePassword')}
      </Link>
      <button type="button" onClick={logout} className="rounded-lg px-3 py-2 text-start hover:bg-black/5">
        {t('logout')}
      </button>
      <div className="px-3 py-2">
        <LanguageSwitch />
      </div>
    </nav>
  );

  return (
    <MeContext.Provider value={{ me, reloadMe }}>
      <div className="min-h-screen md:flex">
        <header className="flex items-center justify-between border-b border-[var(--line)] bg-[var(--card)] px-4 py-3 md:hidden">
          <span className="font-bold text-[var(--color-brand)]">{me.wholesaler.name}</span>
          <button type="button" className="btn btn-secondary" aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}>
            ☰ {unread > 0 && <span className="rounded-full bg-red-600 px-2 text-xs text-white">{unread}</span>}
          </button>
        </header>
        {menuOpen && <div className="border-b border-[var(--line)] bg-[var(--card)] p-3 md:hidden">{nav}</div>}
        <aside className="hidden w-60 shrink-0 border-e border-[var(--line)] bg-[var(--card)] p-4 md:block">
          <div className="mb-4">
            <div className="font-bold text-[var(--color-brand)]">{me.wholesaler.name}</div>
            <div className="muted text-sm">{me.name}</div>
          </div>
          {nav}
        </aside>
        <main className="mx-auto w-full max-w-4xl flex-1 p-4 md:p-6">{children}</main>
      </div>
    </MeContext.Provider>
  );
}
