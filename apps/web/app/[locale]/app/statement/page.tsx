'use client';

import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { get } from '@/lib/api';
import { useLoad } from '@/lib/use-load';
import { useMe } from '@/lib/me-context';
import { useDateFormat } from '@/lib/catalog';
import { Card, ErrorBox, Loading, PageTitle } from '@/components/ui';

interface Statement {
  customer?: { businessName: string };
  balance: string;
  overdue: string;
  rows: Array<{ kind: 'invoice' | 'payment' | 'return'; id: string; reference: string; date: string; amount: string; balance: string }>;
}

// ACC-06: every invoice, payment, and return credit in date order, with a running balance
export default function StatementPage() {
  const t = useTranslations('billing');
  const tM = useTranslations('methods');
  const fmt = useDateFormat();
  const { me } = useMe();
  const customerId = useSearchParams().get('customerId');
  const path = me.userType === 'customer' ? '/my/statement' : `/customers/${customerId}/statement`;
  const { data, error } = useLoad(() => get<Statement>(path), [path]);
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  const label = { invoice: t('rowInvoice'), payment: t('rowPayment'), return: t('rowReturn') };
  return (
    <div className="space-y-4">
      <PageTitle action={<button type="button" className="btn btn-secondary no-print" onClick={() => window.print()}>🖨 {t('print')}</button>}>
        {t('statement')}
        {data.customer && ` · ${data.customer.businessName}`}
      </PageTitle>
      <div className="grid grid-cols-2 gap-2">
        <Card className="text-center">
          <div className="text-xl font-bold" dir="ltr">
            {data.balance}
          </div>
          <div className="muted text-sm">{t('balance')}</div>
        </Card>
        <Card className="text-center">
          <div className={`text-xl font-bold ${data.overdue !== '0.00' ? 'text-red-700' : ''}`} dir="ltr">
            {data.overdue}
          </div>
          <div className="muted text-sm">{t('overdueAmount')}</div>
        </Card>
      </div>
      <Card>
        <table className="w-full text-sm">
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.kind + r.id} className="border-b border-[var(--line)] last:border-0">
                <td className="py-2">
                  <div>{label[r.kind]}</div>
                  <div className="muted text-xs" dir="ltr">
                    {r.kind === 'payment' ? tM(r.reference) : r.reference}
                  </div>
                </td>
                <td className="py-2">{fmt(r.date)}</td>
                <td className={`py-2 text-end ${r.amount.startsWith('-') ? 'text-green-700' : ''}`} dir="ltr">
                  {r.amount}
                </td>
                <td className="py-2 text-end font-semibold" dir="ltr">
                  {r.balance}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
