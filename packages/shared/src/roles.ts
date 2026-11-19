// Roles (C-22). One employee can hold several roles (C-31).
export const ROLES = [
  'owner',
  'sales',
  'stock_manager',
  'delivery_manager',
  'accountant',
  'delivery',
] as const;
export type Role = (typeof ROLES)[number];

export type UserType = 'employee' | 'customer';
