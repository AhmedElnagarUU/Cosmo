import type { Trx } from './db';

// Readable document numbers per wholesaler and year, for example REC-2026-00001 (C-78).
// The counter row is locked while the number is taken, so two documents never get the same number.
export async function nextNumber(trx: Trx, wholesalerId: string, docType: string, prefix: string, year = new Date().getFullYear()) {
  const row = await trx
    .insertInto('document_counters')
    .values({ wholesaler_id: wholesalerId, doc_type: docType, year, last_number: 1 })
    .onConflict((oc) =>
      oc.columns(['wholesaler_id', 'doc_type', 'year']).doUpdateSet((eb) => ({ last_number: eb('document_counters.last_number', '+', 1) })),
    )
    .returning('last_number')
    .executeTakeFirstOrThrow();
  return `${prefix}-${year}-${String(row.last_number).padStart(5, '0')}`;
}
