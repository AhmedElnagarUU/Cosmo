import { z } from 'zod';
import { moneySchema } from './catalog';
import { normalizePhone } from './phone';

const text = (max = 200) => z.string().trim().min(1).max(max);
const optionalText = (max = 200) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'invalid_date');

export const supplierSchema = z.object({
  name: text(),
  contactPerson: optionalText(),
  // Suppliers may have landlines, so only a light check here
  phone: z
    .string()
    .trim()
    .max(30)
    .optional()
    .nullable()
    .transform((v) => (v ? (normalizePhone(v) ?? v) : null)),
  address: optionalText(500),
});
export const updateSupplierSchema = supplierSchema.partial().extend({ isActive: z.boolean().optional() });

// C-43: the goods and the supplier's invoice in one receipt
export const receiptLineSchema = z.object({
  productId: z.string().uuid(),
  batchNumber: optionalText(64),
  expiryDate: date.optional().nullable().transform((v) => v ?? null),
  quantity: z.number().int().min(1).max(10_000_000),
  costPrice: moneySchema,
});
export const createReceiptSchema = z.object({ supplierId: z.string().uuid() });
export const updateReceiptSchema = z.object({
  supplierId: z.string().uuid().optional(),
  supplierInvoiceNumber: optionalText(100),
  supplierInvoiceDate: date.optional().nullable().transform((v) => v ?? null),
  lines: z.array(receiptLineSchema).max(500).optional(),
});

export const SUPPLIER_RETURN_REASONS = ['expired', 'near_expiry', 'damaged', 'wrong_product', 'other'] as const;
// C-42, C-65
export const supplierReturnSchema = z
  .object({
    supplierId: z.string().uuid(),
    reason: z.enum(SUPPLIER_RETURN_REASONS),
    note: optionalText(500),
    lines: z
      .array(
        z.object({
          productId: z.string().uuid(),
          batchId: z.string().uuid(),
          stockState: z.enum(['sellable', 'damaged', 'expired']),
          quantity: z.number().int().min(1).max(10_000_000),
        }),
      )
      .min(1)
      .max(200),
  })
  .refine((v) => v.reason !== 'other' || !!v.note, { message: 'note_required', path: ['note'] });

export const reasonSchema = z.object({ reason: z.string().trim().min(1, 'reason_required').max(500) });

export const PAYMENT_METHODS = ['cash', 'bank_transfer', 'instapay', 'vodafone_cash', 'other'] as const;
export const supplierPaymentSchema = z.object({
  supplierId: z.string().uuid(),
  amount: moneySchema.refine((v) => Number(v) > 0, 'invalid_money'),
  method: z.enum(PAYMENT_METHODS),
  paidOn: date,
  reference: optionalText(100),
});
