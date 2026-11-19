import { z } from 'zod';
import { ROLES } from './roles';
import { normalizePhone } from './phone';

// Shared input rules. The frontend uses them for quick messages.
// The backend always checks again, because it never trusts the client.

export const phoneSchema = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const p = normalizePhone(v);
    if (!p) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'invalid_phone' });
      return z.NEVER;
    }
    return p;
  });

// C-security: at least 8 characters
export const passwordSchema = z.string().min(8, 'password_too_short').max(200);

const name = z.string().trim().min(1).max(200);
const optionalText = z.string().trim().max(500).optional().nullable();

export const loginSchema = z.object({
  loginCode: z.string().trim().toLowerCase().min(1).max(60),
  phone: phoneSchema,
  password: z.string().min(1).max(200),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: passwordSchema,
});

export const forgotPasswordSchema = z.object({
  loginCode: z.string().trim().toLowerCase().min(1).max(60),
  phone: phoneSchema,
});

export const roleSchema = z.enum(ROLES);

export const createEmployeeSchema = z.object({
  name,
  phone: phoneSchema,
  roles: z.array(roleSchema).min(1).max(ROLES.length),
});

export const updateEmployeeSchema = z
  .object({
    name: name.optional(),
    roles: z.array(roleSchema).min(1).max(ROLES.length).optional(),
  })
  .refine((v) => v.name !== undefined || v.roles !== undefined, 'nothing_to_change');

export const createCustomerSchema = z.object({
  businessName: name,
  contactPerson: name,
  phone: phoneSchema,
  address: z.string().trim().min(1).max(500),
  area: optionalText,
});

export const updateCustomerSchema = z.object({
  businessName: name.optional(),
  contactPerson: name.optional(),
  phone: phoneSchema.optional(),
  address: z.string().trim().min(1).max(500).optional(),
  area: optionalText,
});

// C-26: only the owner changes these
export const customerCreditSchema = z.object({
  creditAllowed: z.boolean(),
  creditDays: z.number().int().min(1).max(365),
});

export const INVOICE_TIMINGS = ['on_accepted', 'on_prepared', 'on_delivered'] as const;

// C-40 and the settings that followed it
export const updateSettingsSchema = z
  .object({
    defaultCreditDays: z.number().int().min(1).max(365),
    invoiceTiming: z.enum(INVOICE_TIMINGS),
    nearExpiryMonths: z.number().int().min(1).max(36),
    supplierReturnApproval: z.boolean(),
    // Money is sent as text with two decimals. null switches it off (C-76)
    minimumOrderValue: z
      .string()
      .regex(/^\d{1,10}(\.\d{1,2})?$/, 'invalid_money')
      .nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'nothing_to_change');

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'invalid_time');

// C-37: one row per open day. A missing day is closed.
export const workingHoursSchema = z
  .object({
    days: z
      .array(
        z
          .object({
            dayOfWeek: z.number().int().min(0).max(6),
            opensAt: time,
            closesAt: time,
          })
          .refine((d) => d.opensAt < d.closesAt, 'closes_before_opening'),
      )
      .max(7),
  })
  .refine(
    (v) => new Set(v.days.map((d) => d.dayOfWeek)).size === v.days.length,
    'day_repeated',
  );

export const closedDaySchema = z.object({
  closedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'invalid_date'),
  note: optionalText,
});

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
export type WorkingHoursInput = z.infer<typeof workingHoursSchema>;
