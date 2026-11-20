-- Phase 7: invoices and payments. See docs/workflows/05-invoices-and-payments.md and area 7 of the database design.

CREATE TYPE invoice_status AS ENUM ('unpaid', 'partially_paid', 'paid', 'cancelled');

CREATE TABLE invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wholesaler_id uuid NOT NULL REFERENCES wholesalers(id),
  invoice_number text NOT NULL,
  order_id uuid NOT NULL REFERENCES orders(id),
  customer_id uuid NOT NULL REFERENCES customers(id),
  invoice_date date NOT NULL,
  due_date date NOT NULL,
  payment_choice payment_choice NOT NULL,
  subtotal numeric(12,2) NOT NULL CHECK (subtotal >= 0),
  discount_total numeric(12,2) NOT NULL DEFAULT 0 CHECK (discount_total >= 0),
  total numeric(12,2) NOT NULL CHECK (total >= 0),
  -- Summaries, written in the same transaction as the payment or return (idea 5)
  confirmed_paid numeric(12,2) NOT NULL DEFAULT 0 CHECK (confirmed_paid >= 0),
  return_credit numeric(12,2) NOT NULL DEFAULT 0 CHECK (return_credit >= 0),
  status invoice_status NOT NULL DEFAULT 'unpaid',
  created_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  UNIQUE (wholesaler_id, invoice_number),
  CHECK (due_date >= invoice_date),
  -- Never more paid than the invoice is worth (refunds handle the rest in phase 8)
  CHECK (confirmed_paid + return_credit <= total OR status = 'cancelled')
);
-- One invoice per order (C-59), except cancelled ones
CREATE UNIQUE INDEX invoices_one_per_order ON invoices (order_id) WHERE status <> 'cancelled';
CREATE INDEX invoices_customer ON invoices (customer_id, status, due_date);

CREATE TABLE invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wholesaler_id uuid NOT NULL REFERENCES wholesalers(id),
  invoice_id uuid NOT NULL REFERENCES invoices(id),
  order_line_id uuid REFERENCES order_lines(id),
  product_id uuid NOT NULL REFERENCES products(id),
  product_name_ar text NOT NULL,
  product_name_en text NOT NULL,
  quantity int NOT NULL CHECK (quantity > 0),
  is_bonus boolean NOT NULL DEFAULT false,
  unit_price numeric(12,2) NOT NULL CHECK (unit_price >= 0),
  discount_percent numeric(5,2),
  line_total numeric(12,2) NOT NULL CHECK (line_total >= 0),
  line_order int NOT NULL DEFAULT 0
);
CREATE INDEX invoice_lines_invoice ON invoice_lines (invoice_id);

ALTER TABLE payments ADD CONSTRAINT payments_invoice_fk FOREIGN KEY (invoice_id) REFERENCES invoices(id);
ALTER TABLE customer_returns ADD CONSTRAINT customer_returns_invoice_fk FOREIGN KEY (invoice_id) REFERENCES invoices(id);
CREATE INDEX payments_invoice ON payments (invoice_id);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['invoices', 'invoice_lines'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (wholesaler_id = nullif(current_setting(''app.wholesaler_id'', true), '''')::uuid) WITH CHECK (wholesaler_id = nullif(current_setting(''app.wholesaler_id'', true), '''')::uuid)',
      t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE ON invoices TO cosmo_app;
-- Lines are rewritten while an invoice is corrected before delivery
GRANT SELECT, INSERT, UPDATE, DELETE ON invoice_lines TO cosmo_app;
