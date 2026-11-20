-- Phase 6: delivery. See docs/workflows/04-delivery.md and docs/technical/01-database-design.md, areas 6 to 8.

CREATE TYPE trip_status AS ENUM ('planned', 'in_progress', 'finished', 'closed');
CREATE TYPE stop_result AS ENUM ('waiting', 'delivered', 'failed');
CREATE TYPE failure_reason AS ENUM ('not_available', 'address_problem', 'refused', 'other');
CREATE TYPE customer_payment_method AS ENUM ('cash', 'instapay', 'vodafone_cash', 'bank_transfer', 'other');
CREATE TYPE customer_payment_status AS ENUM ('waiting', 'confirmed', 'rejected', 'cancelled');
CREATE TYPE return_source AS ENUM ('normal', 'at_the_door');
CREATE TYPE return_status AS ENUM ('requested', 'received', 'completed', 'cancelled');

CREATE TABLE trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wholesaler_id uuid NOT NULL REFERENCES wholesalers(id),
  trip_number text NOT NULL,
  delivery_person_id uuid NOT NULL REFERENCES users(id),
  status trip_status NOT NULL DEFAULT 'planned',
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  cash_expected numeric(12,2),
  cash_received numeric(12,2),
  cash_difference_note text,
  closed_at timestamptz,
  UNIQUE (wholesaler_id, trip_number)
);
CREATE INDEX trips_person ON trips (delivery_person_id, created_at DESC);

CREATE TABLE trip_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wholesaler_id uuid NOT NULL REFERENCES wholesalers(id),
  trip_id uuid NOT NULL REFERENCES trips(id),
  order_id uuid NOT NULL REFERENCES orders(id),
  stop_position int NOT NULL,
  -- Copied from the trip, so the database can refuse an order in two active trips
  trip_active boolean NOT NULL DEFAULT true,
  result stop_result NOT NULL DEFAULT 'waiting',
  failure_reason failure_reason,
  failure_note text,
  result_at timestamptz,
  goods_back_confirmed boolean NOT NULL DEFAULT false,
  goods_back_by uuid REFERENCES users(id),
  signed_paper_received boolean NOT NULL DEFAULT false,
  paper_received_by uuid REFERENCES users(id),
  paper_received_at timestamptz,
  CHECK (result <> 'failed' OR failure_reason IS NOT NULL)
);
CREATE UNIQUE INDEX trip_stops_one_active ON trip_stops (order_id) WHERE trip_active;
CREATE INDEX trip_stops_trip ON trip_stops (trip_id, stop_position);

-- Payments from customers (C-27). In phase 6 they are recorded at the door. Invoices link them in phase 7.
CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wholesaler_id uuid NOT NULL REFERENCES wholesalers(id),
  order_id uuid REFERENCES orders(id),
  invoice_id uuid,
  customer_id uuid NOT NULL REFERENCES customers(id),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  method customer_payment_method NOT NULL,
  reference text,
  paid_on date NOT NULL,
  status customer_payment_status NOT NULL,
  recorded_by uuid REFERENCES users(id),
  trip_stop_id uuid REFERENCES trip_stops(id),
  decided_by uuid REFERENCES users(id),
  decided_at timestamptz,
  rejection_reason text,
  cancel_reason text,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX payments_idempotency ON payments (wholesaler_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX payments_waiting ON payments (wholesaler_id, status);

-- Customer returns (C-19, C-47). Items refused at the door are created here in phase 6. Phase 8 completes them.
CREATE TABLE customer_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wholesaler_id uuid NOT NULL REFERENCES wholesalers(id),
  return_number text NOT NULL,
  order_id uuid NOT NULL REFERENCES orders(id),
  invoice_id uuid,
  customer_id uuid NOT NULL REFERENCES customers(id),
  source return_source NOT NULL,
  trip_stop_id uuid REFERENCES trip_stops(id),
  status return_status NOT NULL DEFAULT 'requested',
  reason text NOT NULL,
  note text,
  credit_amount numeric(12,2) NOT NULL DEFAULT 0,
  applied_to_invoice numeric(12,2) NOT NULL DEFAULT 0,
  left_over numeric(12,2) NOT NULL DEFAULT 0,
  left_over_choice text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  checked_by uuid REFERENCES users(id),
  completed_at timestamptz,
  UNIQUE (wholesaler_id, return_number)
);

CREATE TABLE customer_return_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wholesaler_id uuid NOT NULL REFERENCES wholesalers(id),
  customer_return_id uuid NOT NULL REFERENCES customer_returns(id),
  order_line_id uuid NOT NULL REFERENCES order_lines(id),
  product_id uuid NOT NULL REFERENCES products(id),
  batch_id uuid NOT NULL REFERENCES batches(id),
  quantity int NOT NULL CHECK (quantity > 0),
  condition text CHECK (condition IN ('sellable', 'damaged')),
  unit_credit numeric(12,2) NOT NULL DEFAULT 0,
  line_credit numeric(12,2) NOT NULL DEFAULT 0
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['trips', 'trip_stops', 'payments', 'customer_returns', 'customer_return_lines'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (wholesaler_id = nullif(current_setting(''app.wholesaler_id'', true), '''')::uuid) WITH CHECK (wholesaler_id = nullif(current_setting(''app.wholesaler_id'', true), '''')::uuid)',
      t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE ON trips, payments, customer_returns, customer_return_lines TO cosmo_app;
-- Stops of a planned trip can be replaced
GRANT SELECT, INSERT, UPDATE, DELETE ON trip_stops TO cosmo_app;
GRANT DELETE ON trips TO cosmo_app;
