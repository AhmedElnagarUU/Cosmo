-- Phase 1: wholesaler, settings, people, sessions, activity, notifications.
-- See docs/technical/01-database-design.md, areas 1 and 9.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_type AS ENUM ('employee', 'customer');
CREATE TYPE employee_role AS ENUM ('owner', 'sales', 'stock_manager', 'delivery_manager', 'accountant', 'delivery');
CREATE TYPE invoice_timing AS ENUM ('on_accepted', 'on_prepared', 'on_delivered');
CREATE TYPE reset_status AS ENUM ('waiting', 'done');
CREATE TYPE notification_channel AS ENUM ('in_app');
CREATE TYPE delivery_status AS ENUM ('pending', 'sent', 'failed');

-- Not protected by row level security: it is needed to find the wholesaler from the login link,
-- and it holds only the business name and contact details.
CREATE TABLE wholesalers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  login_code text NOT NULL UNIQUE CHECK (login_code ~ '^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$'),
  phone text,
  address text,
  time_zone text NOT NULL DEFAULT 'Africa/Cairo',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE settings (
  wholesaler_id uuid PRIMARY KEY REFERENCES wholesalers(id),
  default_credit_days int NOT NULL DEFAULT 30 CHECK (default_credit_days BETWEEN 1 AND 365),
  invoice_timing invoice_timing NOT NULL DEFAULT 'on_delivered',
  near_expiry_months int NOT NULL DEFAULT 6 CHECK (near_expiry_months BETWEEN 1 AND 36),
  supplier_return_approval boolean NOT NULL DEFAULT false,
  minimum_order_value numeric(12,2) CHECK (minimum_order_value IS NULL OR minimum_order_value >= 0),
  max_extra_fields int NOT NULL DEFAULT 20 CHECK (max_extra_fields BETWEEN 0 AND 100),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE working_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wholesaler_id uuid NOT NULL REFERENCES wholesalers(id),
  day_of_week int NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  opens_at time NOT NULL,
  closes_at time NOT NULL,
  CHECK (opens_at < closes_at),
  UNIQUE (wholesaler_id, day_of_week)
);

CREATE TABLE closed_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wholesaler_id uuid NOT NULL REFERENCES wholesalers(id),
  closed_on date NOT NULL,
  note text,
  UNIQUE (wholesaler_id, closed_on)
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wholesaler_id uuid NOT NULL REFERENCES wholesalers(id),
  phone text NOT NULL,
  password_hash text NOT NULL,
  user_type user_type NOT NULL,
  must_change_password boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  failed_logins int NOT NULL DEFAULT 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (wholesaler_id, phone)
);

CREATE TABLE employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wholesaler_id uuid NOT NULL REFERENCES wholesalers(id),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE employee_roles (
  employee_id uuid NOT NULL REFERENCES employees(id),
  role employee_role NOT NULL,
  wholesaler_id uuid NOT NULL REFERENCES wholesalers(id),
  PRIMARY KEY (employee_id, role)
);

CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wholesaler_id uuid NOT NULL REFERENCES wholesalers(id),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id),
  business_name text NOT NULL,
  contact_person text NOT NULL,
  phone text NOT NULL,
  address text NOT NULL,
  area text,
  credit_allowed boolean NOT NULL DEFAULT false,
  credit_days int NOT NULL CHECK (credit_days BETWEEN 1 AND 365),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE password_reset_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wholesaler_id uuid NOT NULL REFERENCES wholesalers(id),
  user_id uuid NOT NULL REFERENCES users(id),
  status reset_status NOT NULL DEFAULT 'waiting',
  handled_by uuid REFERENCES users(id),
  requested_at timestamptz NOT NULL DEFAULT now(),
  handled_at timestamptz
);
-- At most one waiting request per user
CREATE UNIQUE INDEX password_reset_one_waiting ON password_reset_requests (user_id) WHERE status = 'waiting';

-- Not protected by row level security: it is read by the hash of the cookie code
-- before the wholesaler is known. Only the hash is stored.
CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  wholesaler_id uuid NOT NULL REFERENCES wholesalers(id),
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_user ON sessions (user_id);

CREATE TABLE activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wholesaler_id uuid NOT NULL REFERENCES wholesalers(id),
  user_id uuid REFERENCES users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  reason text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_important boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activity_log_list ON activity_log (wholesaler_id, created_at DESC);
CREATE INDEX activity_log_user ON activity_log (wholesaler_id, user_id, created_at DESC);

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wholesaler_id uuid NOT NULL REFERENCES wholesalers(id),
  recipient_user_id uuid NOT NULL REFERENCES users(id),
  type text NOT NULL,
  title_ar text NOT NULL,
  title_en text NOT NULL,
  body_ar text NOT NULL DEFAULT '',
  body_en text NOT NULL DEFAULT '',
  entity_type text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_inbox ON notifications (recipient_user_id, created_at DESC);

CREATE TABLE notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wholesaler_id uuid NOT NULL REFERENCES wholesalers(id),
  notification_id uuid NOT NULL REFERENCES notifications(id),
  channel notification_channel NOT NULL DEFAULT 'in_app',
  status delivery_status NOT NULL DEFAULT 'pending',
  sent_at timestamptz
);

CREATE INDEX users_wholesaler ON users (wholesaler_id);
CREATE INDEX customers_list ON customers (wholesaler_id, business_name);
CREATE INDEX employees_list ON employees (wholesaler_id, name);

-- Row level security (docs/technical/04-security.md, "Keeping wholesalers apart").
-- Each transaction sets app.wholesaler_id. Rows of other wholesalers are invisible.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'settings', 'working_hours', 'closed_days', 'users', 'employees', 'employee_roles',
    'customers', 'password_reset_requests', 'activity_log', 'notifications', 'notification_deliveries'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (wholesaler_id = nullif(current_setting(''app.wholesaler_id'', true), '''')::uuid) WITH CHECK (wholesaler_id = nullif(current_setting(''app.wholesaler_id'', true), '''')::uuid)',
      t);
  END LOOP;
END $$;

-- The app user: read and write, except the activity log, which it can only add to and read (C-30).
GRANT USAGE ON SCHEMA public TO cosmo_app;
-- Rows that are history are never deleted, so DELETE is given only where it is safe.
GRANT SELECT ON wholesalers TO cosmo_app;
GRANT SELECT, INSERT, UPDATE ON
  settings, users, employees, customers, password_reset_requests, notifications, notification_deliveries
TO cosmo_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON working_hours, closed_days, employee_roles, sessions TO cosmo_app;
GRANT SELECT, INSERT ON activity_log TO cosmo_app;
