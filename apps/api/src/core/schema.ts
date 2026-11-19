import type { ColumnType, Generated } from 'kysely';

// Table types for Kysely. They match the SQL files in apps/api/migrations.
type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;
type Uuid = Generated<string>;

export interface WholesalersTable {
  id: Uuid;
  name: string;
  login_code: string;
  phone: string | null;
  address: string | null;
  time_zone: Generated<string>;
  is_active: Generated<boolean>;
  created_at: Generated<Date>;
}

export interface SettingsTable {
  wholesaler_id: string;
  default_credit_days: Generated<number>;
  invoice_timing: Generated<'on_accepted' | 'on_prepared' | 'on_delivered'>;
  near_expiry_months: Generated<number>;
  supplier_return_approval: Generated<boolean>;
  minimum_order_value: string | null;
  max_extra_fields: Generated<number>;
  updated_at: Generated<Date>;
}

export interface WorkingHoursTable {
  id: Uuid;
  wholesaler_id: string;
  day_of_week: number;
  opens_at: string;
  closes_at: string;
}

export interface ClosedDaysTable {
  id: Uuid;
  wholesaler_id: string;
  closed_on: ColumnType<string, string, string>;
  note: string | null;
}

export interface UsersTable {
  id: Uuid;
  wholesaler_id: string;
  phone: string;
  password_hash: string;
  user_type: 'employee' | 'customer';
  must_change_password: Generated<boolean>;
  is_active: Generated<boolean>;
  failed_logins: Generated<number>;
  locked_until: Timestamp | null;
  last_login_at: Timestamp | null;
  created_at: Generated<Date>;
}

export interface EmployeesTable {
  id: Uuid;
  wholesaler_id: string;
  user_id: string;
  name: string;
  created_at: Generated<Date>;
}

export interface EmployeeRolesTable {
  employee_id: string;
  role: 'owner' | 'sales' | 'stock_manager' | 'delivery_manager' | 'accountant' | 'delivery';
  wholesaler_id: string;
}

export interface CustomersTable {
  id: Uuid;
  wholesaler_id: string;
  user_id: string;
  business_name: string;
  contact_person: string;
  phone: string;
  address: string;
  area: string | null;
  credit_allowed: Generated<boolean>;
  credit_days: number;
  is_active: Generated<boolean>;
  created_by: string | null;
  created_at: Generated<Date>;
}

export interface PasswordResetRequestsTable {
  id: Uuid;
  wholesaler_id: string;
  user_id: string;
  status: Generated<'waiting' | 'done'>;
  handled_by: string | null;
  requested_at: Generated<Date>;
  handled_at: Timestamp | null;
}

export interface SessionsTable {
  id: Uuid;
  user_id: string;
  wholesaler_id: string;
  token_hash: string;
  created_at: Generated<Date>;
  last_used_at: Timestamp;
  expires_at: Timestamp;
}

export interface ActivityLogTable {
  id: Uuid;
  wholesaler_id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  reason: string | null;
  details: ColumnType<unknown, string | undefined, never>;
  is_important: Generated<boolean>;
  created_at: Generated<Date>;
}

export interface NotificationsTable {
  id: Uuid;
  wholesaler_id: string;
  recipient_user_id: string;
  type: string;
  title_ar: string;
  title_en: string;
  body_ar: Generated<string>;
  body_en: Generated<string>;
  entity_type: string | null;
  entity_id: string | null;
  read_at: Timestamp | null;
  created_at: Generated<Date>;
}

export interface NotificationDeliveriesTable {
  id: Uuid;
  wholesaler_id: string;
  notification_id: string;
  channel: Generated<'in_app'>;
  status: Generated<'pending' | 'sent' | 'failed'>;
  sent_at: Timestamp | null;
}

export interface Database {
  wholesalers: WholesalersTable;
  settings: SettingsTable;
  working_hours: WorkingHoursTable;
  closed_days: ClosedDaysTable;
  users: UsersTable;
  employees: EmployeesTable;
  employee_roles: EmployeeRolesTable;
  customers: CustomersTable;
  password_reset_requests: PasswordResetRequestsTable;
  sessions: SessionsTable;
  activity_log: ActivityLogTable;
  notifications: NotificationsTable;
  notification_deliveries: NotificationDeliveriesTable;
}
