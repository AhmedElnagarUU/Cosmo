-- Phase 3: suppliers, receiving, supplier returns, supplier payments.
-- See docs/technical/01-database-design.md, area 4.

CREATE TYPE receipt_status AS ENUM ('draft', 'confirmed');
CREATE TYPE supplier_return_status AS ENUM ('waiting_for_owner', 'confirmed', 'rejected');
CREATE TYPE supplier_return_reason AS ENUM ('expired', 'near_expiry', 'damaged', 'wrong_product', 'other');
CREATE TYPE payment_method AS ENUM ('cash', 'bank_transfer', 'instapay', 'vodafone_cash', 'other');

-- Readable numbers such as REC-2026-00001. Locked while a number is taken, so numbers never repeat.
CREATE TABLE document_counters (
  wholesaler_id uuid NOT NULL REFERENCES wholesalers(id),
  doc_type text NOT NULL,
  year int NOT NULL,
  last_number int NOT NULL DEFAULT 0,
  PRIMARY KEY (wholesaler_id, doc_type, year)
);

CREATE TABLE suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wholesaler_id uuid NOT NULL REFERENCES wholesalers(id),
  name text NOT NULL,
  contact_person text,
  phone text,
  address text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX suppliers_name ON suppliers (wholesaler_id, lower(name));

CREATE TABLE receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wholesaler_id uuid NOT NULL REFERENCES wholesalers(id),
  receipt_number text,
  supplier_id uuid NOT NULL REFERENCES suppliers(id),
  supplier_invoice_number text,
  supplier_invoice_date date,
  total_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  status receipt_status NOT NULL DEFAULT 'draft',
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_by uuid REFERENCES users(id),
  confirmed_at timestamptz
);
CREATE UNIQUE INDEX receipts_number ON receipts (wholesaler_id, receipt_number) WHERE receipt_number IS NOT NULL;
CREATE INDEX receipts_supplier ON receipts (supplier_id, created_at DESC);

CREATE TABLE receipt_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wholesaler_id uuid NOT NULL REFERENCES wholesalers(id),
  receipt_id uuid NOT NULL REFERENCES receipts(id),
  product_id uuid NOT NULL REFERENCES products(id),
  -- Typed while the receipt is a draft. The batch row is created or found on confirmation.
  batch_number text,
  expiry_date date,
  batch_id uuid REFERENCES batches(id),
  quantity int NOT NULL CHECK (quantity > 0),
  cost_price numeric(12,2) NOT NULL CHECK (cost_price >= 0),
  line_order int NOT NULL DEFAULT 0
);
CREATE INDEX receipt_lines_receipt ON receipt_lines (receipt_id);
CREATE INDEX receipt_lines_batch ON receipt_lines (batch_id);

CREATE TABLE supplier_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wholesaler_id uuid NOT NULL REFERENCES wholesalers(id),
  return_number text NOT NULL,
  supplier_id uuid NOT NULL REFERENCES suppliers(id),
  status supplier_return_status NOT NULL,
  reason supplier_return_reason NOT NULL,
  note text,
  total_value numeric(12,2) NOT NULL DEFAULT 0,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid REFERENCES users(id),
  decided_at timestamptz,
  rejection_reason text,
  confirmed_at timestamptz,
  UNIQUE (wholesaler_id, return_number),
  CHECK (reason <> 'other' OR note IS NOT NULL)
);

CREATE TABLE supplier_return_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wholesaler_id uuid NOT NULL REFERENCES wholesalers(id),
  supplier_return_id uuid NOT NULL REFERENCES supplier_returns(id),
  product_id uuid NOT NULL REFERENCES products(id),
  batch_id uuid NOT NULL REFERENCES batches(id),
  stock_state stock_state NOT NULL CHECK (stock_state IN ('sellable', 'damaged', 'expired')),
  quantity int NOT NULL CHECK (quantity > 0),
  cost_price numeric(12,2) NOT NULL CHECK (cost_price >= 0)
);

CREATE TABLE supplier_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wholesaler_id uuid NOT NULL REFERENCES wholesalers(id),
  supplier_id uuid NOT NULL REFERENCES suppliers(id),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  method payment_method NOT NULL,
  paid_on date NOT NULL,
  reference text,
  recorded_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  cancelled_by uuid REFERENCES users(id),
  cancel_reason text,
  CHECK ((cancelled_at IS NULL) = (cancel_reason IS NULL))
);
CREATE INDEX supplier_payments_supplier ON supplier_payments (supplier_id, paid_on DESC);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'document_counters', 'suppliers', 'receipts', 'receipt_lines', 'supplier_returns', 'supplier_return_lines', 'supplier_payments'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (wholesaler_id = nullif(current_setting(''app.wholesaler_id'', true), '''')::uuid) WITH CHECK (wholesaler_id = nullif(current_setting(''app.wholesaler_id'', true), '''')::uuid)',
      t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE ON document_counters, suppliers, receipts, supplier_returns, supplier_payments TO cosmo_app;
-- Draft receipt lines can be replaced while typing. Confirmed ones are protected by the code.
GRANT SELECT, INSERT, UPDATE, DELETE ON receipt_lines TO cosmo_app;
GRANT SELECT, INSERT ON supplier_return_lines TO cosmo_app;
