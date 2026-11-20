import { z } from 'zod';

// Order statuses (docs/workflows/01-order-lifecycle.md)
export const ORDER_STATUSES = [
  'placed',
  'waiting_for_customer',
  'accepted',
  'rejected',
  'preparing',
  'ready',
  'out_for_delivery',
  'delivered',
  'delivery_failed',
  'cancelled',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_CHOICES = ['on_arrival', 'credit'] as const;
export const REDUCE_REASONS = ['not_found', 'damaged', 'expired', 'other'] as const;

// Only choices are sent. Every price and total is calculated by the backend (docs/technical/02-api-design.md)
export const cartSchema = z.object({
  customerId: z.string().uuid().optional(),
  paymentChoice: z.enum(PAYMENT_CHOICES),
  lines: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().min(1).max(100_000),
        mustHave: z.boolean().optional().default(false),
      }),
    )
    .min(1)
    .max(200)
    .refine((l) => new Set(l.map((x) => x.productId)).size === l.length, 'product_repeated'),
});
export type CartInput = z.infer<typeof cartSchema>;

const change = z
  .object({
    orderLineId: z.string().uuid(),
    newQuantity: z.number().int().min(0).max(100_000),
    reason: z.enum(REDUCE_REASONS),
    note: z.string().trim().max(500).optional().nullable(),
  })
  .refine((c) => c.reason !== 'other' || !!c.note, { message: 'note_required', path: ['note'] });

export const acceptSchema = z.object({ changes: z.array(change).max(200).optional().default([]) });
export const rejectSchema = z.object({ reason: z.string().trim().min(1, 'reason_required').max(500) });
export const cancelSchema = z.object({ reason: z.string().trim().max(500).optional().nullable() });
export const answerSchema = z.object({ answer: z.enum(['accept_change', 'cancel']) });

export const picksSchema = z.object({
  picks: z
    .array(z.object({ batchId: z.string().uuid(), quantity: z.number().int().min(1).max(100_000) }))
    .max(50)
    .refine((p) => new Set(p.map((x) => x.batchId)).size === p.length, 'batch_repeated'),
});
export const reduceSchema = z
  .object({
    newQuantity: z.number().int().min(0).max(100_000),
    reason: z.enum(REDUCE_REASONS),
    note: z.string().trim().max(500).optional().nullable(),
  })
  .refine((c) => c.reason !== 'other' || !!c.note, { message: 'note_required', path: ['note'] });

// ---------- Delivery (phase 6) ----------
export const FAILURE_REASONS = ['not_available', 'address_problem', 'refused', 'other'] as const;
export const CUSTOMER_PAYMENT_METHODS = ['cash', 'instapay', 'vodafone_cash', 'bank_transfer', 'other'] as const;
export const DOOR_PAYMENT_METHODS = ['cash', 'instapay', 'vodafone_cash'] as const;

export const tripSchema = z.object({
  deliveryPersonId: z.string().uuid(),
  orderIds: z.array(z.string().uuid()).min(1).max(100).refine((a) => new Set(a).size === a.length, 'order_repeated'),
});
export const updateTripSchema = z.object({
  deliveryPersonId: z.string().uuid().optional(),
  orderIds: z.array(z.string().uuid()).min(1).max(100).refine((a) => new Set(a).size === a.length, 'order_repeated').optional(),
});
export const stopOrderSchema = z.object({ stopIds: z.array(z.string().uuid()).min(1).max(100) });
export const deliverSchema = z.object({
  refused: z
    .array(
      z.object({
        orderLineId: z.string().uuid(),
        quantity: z.number().int().min(1).max(100_000),
      }),
    )
    .max(200)
    .optional()
    .default([]),
  refusedReason: z.string().trim().max(500).optional().nullable(),
});
export const failSchema = z
  .object({ reason: z.enum(FAILURE_REASONS), note: z.string().trim().max(500).optional().nullable() })
  .refine((v) => v.reason !== 'other' || !!v.note, { message: 'note_required', path: ['note'] });
export const doorPaymentSchema = z.object({
  method: z.enum(DOOR_PAYMENT_METHODS),
  amount: z.string().trim().regex(/^\d{1,10}(\.\d{1,2})?$/, 'invalid_money').refine((v) => Number(v) > 0, 'invalid_money'),
  reference: z.string().trim().max(100).optional().nullable(),
}).refine((v) => v.method === 'cash' || !!v.reference, { message: 'reference_required', path: ['reference'] });
