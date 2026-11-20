import { z } from 'zod';

// Product fields (C-66, docs/workflows/10-product-fields.md)

export const PRODUCT_TYPES = ['medicine', 'cosmetic'] as const;
export const APPLIES_TO = ['medicine', 'cosmetic', 'both'] as const;
export const STORAGE = ['room', 'fridge'] as const;
export const EXTRA_FIELD_TYPES = ['text', 'number', 'yes_no', 'date', 'choice'] as const;

// Money as text with up to two decimals, for example "125.50"
export const moneySchema = z.string().trim().regex(/^\d{1,10}(\.\d{1,2})?$/, 'invalid_money');

const text = (max = 200) => z.string().trim().min(1).max(max);
const optionalText = (max = 200) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const listItemSchema = z.object({
  nameAr: text(100),
  nameEn: text(100),
  appliesTo: z.enum(APPLIES_TO).optional(),
});
export const updateListItemSchema = z
  .object({
    nameAr: text(100).optional(),
    nameEn: text(100).optional(),
    appliesTo: z.enum(APPLIES_TO).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'nothing_to_change');

export const medicineDetailsSchema = z.object({
  activeIngredient: text(300),
  strength: text(100),
  dosageFormId: z.string().uuid(),
  storage: z.enum(STORAGE),
  publicPrice: moneySchema.optional().nullable().transform((v) => v ?? null),
  registrationNumber: optionalText(100),
  needsPrescription: z.boolean().optional().nullable().transform((v) => v ?? null),
});

export const cosmeticDetailsSchema = z.object({
  shadeName: optionalText(100),
  shadeNumber: optionalText(50),
  suitableFor: optionalText(200),
  periodAfterOpeningMonths: z.number().int().min(1).max(120).optional().nullable().transform((v) => v ?? null),
});

// Values of extra fields, by field id. Checked against each field's type by the backend.
export const extraValuesSchema = z.record(z.string().uuid(), z.string().max(500)).optional().default({});

const productBase = {
  nameAr: text(),
  nameEn: text(),
  barcode: z
    .string()
    .trim()
    .max(64)
    .regex(/^[0-9A-Za-z-]*$/, 'invalid_barcode')
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  brandId: z.string().uuid(),
  categoryId: z.string().uuid(),
  unit: text(50),
  packSize: text(100),
  description: optionalText(2000),
  trackBatches: z.boolean(),
};

export const createProductSchema = z.discriminatedUnion('productType', [
  z.object({
    productType: z.literal('medicine'),
    ...productBase,
    costPrice: moneySchema,
    sellingPrice: moneySchema,
    medicine: medicineDetailsSchema,
    extraValues: extraValuesSchema,
  }),
  z.object({
    productType: z.literal('cosmetic'),
    ...productBase,
    costPrice: moneySchema,
    sellingPrice: moneySchema,
    cosmetic: cosmeticDetailsSchema,
    extraValues: extraValuesSchema,
  }),
]);

// Editing never changes prices (C-64). The product type cannot change.
export const updateProductSchema = z.object({
  ...productBase,
  trackBatches: z.boolean().optional(),
  medicine: medicineDetailsSchema.optional(),
  cosmetic: cosmeticDetailsSchema.optional(),
  extraValues: extraValuesSchema,
});

export const priceChangeSchema = z
  .object({ sellingPrice: moneySchema.optional(), costPrice: moneySchema.optional() })
  .refine((v) => v.sellingPrice !== undefined || v.costPrice !== undefined, 'nothing_to_change');

export const extraFieldSchema = z
  .object({
    nameAr: text(100),
    nameEn: text(100),
    fieldType: z.enum(EXTRA_FIELD_TYPES),
    choices: z.array(text(100)).max(50).optional().default([]),
    appliesTo: z.enum(APPLIES_TO),
    isRequired: z.boolean(),
    shownToCustomers: z.boolean(),
  })
  .refine((v) => v.fieldType !== 'choice' || v.choices.length >= 2, { message: 'choices_needed', path: ['choices'] });

export const updateExtraFieldSchema = z
  .object({
    nameAr: text(100).optional(),
    nameEn: text(100).optional(),
    choices: z.array(text(100)).max(50).optional(),
    isRequired: z.boolean().optional(),
    shownToCustomers: z.boolean().optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(1000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'nothing_to_change');

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'invalid_date');

// C-41
export const offerSchema = z
  .discriminatedUnion('offerType', [
    z.object({
      offerType: z.literal('discount'),
      productId: z.string().uuid(),
      discountPercent: z.string().regex(/^\d{1,2}(\.\d{1,2})?$/, 'invalid_percent'),
      startsOn: date.optional().nullable(),
      endsOn: date.optional().nullable(),
    }),
    z.object({
      offerType: z.literal('bonus'),
      productId: z.string().uuid(),
      buyQuantity: z.number().int().min(1).max(10000),
      freeQuantity: z.number().int().min(1).max(10000),
      startsOn: date.optional().nullable(),
      endsOn: date.optional().nullable(),
    }),
  ])
  .refine((v) => !v.startsOn || !v.endsOn || v.startsOn <= v.endsOn, { message: 'ends_before_start', path: ['endsOn'] })
  .refine((v) => v.offerType !== 'discount' || Number(v.discountPercent) > 0, { message: 'invalid_percent', path: ['discountPercent'] });

// Stock (C-09, C-10)
const reason = z.string().trim().min(1, 'reason_required').max(500);

export const adjustmentSchema = z
  .object({
    productId: z.string().uuid(),
    batchId: z.string().uuid().optional().nullable(),
    newBatch: z
      .object({ batchNumber: text(64), expiryDate: date })
      .optional()
      .nullable(),
    countedQuantity: z.number().int().min(0).max(10_000_000),
    reason,
  })
  .refine((v) => !(v.batchId && v.newBatch), { message: 'choose_one_batch', path: ['batchId'] });

export const DAMAGE_KINDS = ['damaged', 'lost'] as const;
export const damageSchema = z.object({
  productId: z.string().uuid(),
  batchId: z.string().uuid(),
  kind: z.enum(DAMAGE_KINDS),
  quantity: z.number().int().min(1).max(10_000_000),
  reason,
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ExtraFieldInput = z.infer<typeof extraFieldSchema>;
export type OfferInput = z.infer<typeof offerSchema>;
