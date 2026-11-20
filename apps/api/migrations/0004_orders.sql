-- Phase 4: customer ordering and acceptance.
-- See docs/technical/01-database-design.md, area 5, and docs/workflows/01-order-lifecycle.md.

CREATE TYPE order_status AS ENUM (
  'placed', 'waiting_for_customer', 'accepted', 'rejected', 'preparing', 'ready',
  'out_for_delivery', 'delivered', 'delivery_failed', 'cancelled'
);
CREATE TYPE payment_choice AS ENUM ('on_arrival', 'credit');
CREATE TYPE change_stage AS ENUM ('acceptance', 'preparation');
CREATE TYPE reduce_reason AS ENUM ('not_found', 'damaged', 'expired', 'other');

CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wholesaler_id uuid NOT NULL REFERENCES wholesalers(id),
  order_number text NOT NULL,
  customer_id uuid NOT NULL REFERENCES customers(id),
  placed_by uuid NOT NULL REFERENCES users(id),
  status order_status NOT NULL DEFAULT 'placed',
  -- When an order waits for the customer, the status it returns to after "accept the change"
  resume_status order_status,
  payment_choice payment_choice NOT NULL,
  subtotal numeric(12,2) NOT NULL CHECK (subtotal >= 0),
  discount_total numeric(12,2) NOT NULL DEFAULT 0 CHECK (discount_total >= 0),
  total numeric(12,2) NOT NULL CHECK (total >= 0),
  placed_while_closed boolean NOT NULL DEFAULT false,
  waiting_since timestamptz,
  reported_to_owner boolean NOT NULL DEFAULT false,
  preparing_by uuid REFERENCES users(id),
  idempotency_key text,
  placed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (wholesaler_id, order_number)
);
CREATE UNIQUE INDEX orders_idempotency ON orders (wholesaler_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX orders_list ON orders (wholesaler_id, status, placed_at);
CREATE INDEX orders_customer ON orders (customer_id, placed_at DESC);

CREATE TABLE order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wholesaler_id uuid NOT NULL REFERENCES wholesalers(id),
  order_id uuid NOT NULL REFERENCES orders(id),
  product_id uuid NOT NULL REFERENCES products(id),
  is_must_have boolean NOT NULL DEFAULT false,
  ordered_qty int NOT NULL CHECK (ordered_qty > 0),
  current_qty int NOT NULL CHECK (current_qty >= 0),
  bonus_qty int NOT NULL DEFAULT 0 CHECK (bonus_qty >= 0),
  unit_price numeric(12,2) NOT NULL CHECK (unit_price >= 0),
  discount_percent numeric(5,2),
  offer_id uuid REFERENCES offers(id),
  -- The offer as it was when the order was placed, so bonus units can be recalculated later (C-41)
  offer_buy int,
  offer_free int,
  line_total numeric(12,2) NOT NULL CHECK (line_total >= 0),
  line_order int NOT NULL DEFAULT 0,
  -- A quantity can only go down (C-38)
  CHECK (current_qty <= ordered_qty),
  UNIQUE (order_id, product_id)
);
CREATE INDEX order_lines_order ON order_lines (order_id);

CREATE TABLE order_line_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wholesaler_id uuid NOT NULL REFERENCES wholesalers(id),
  order_line_id uuid NOT NULL REFERENCES order_lines(id),
  stage change_stage NOT NULL,
  old_qty int NOT NULL,
  new_qty int NOT NULL CHECK (new_qty < old_qty),
  reason reduce_reason NOT NULL,
  note text,
  changed_by uuid REFERENCES users(id),
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_line_changes_line ON order_line_changes (order_line_id);

CREATE TABLE order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wholesaler_id uuid NOT NULL REFERENCES wholesalers(id),
  order_id uuid NOT NULL REFERENCES orders(id),
  from_status order_status,
  to_status order_status NOT NULL,
  changed_by uuid REFERENCES users(id),
  reason text,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_status_history_order ON order_status_history (order_id, changed_at);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['orders', 'order_lines', 'order_line_changes', 'order_status_history'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (wholesaler_id = nullif(current_setting(''app.wholesaler_id'', true), '''')::uuid) WITH CHECK (wholesaler_id = nullif(current_setting(''app.wholesaler_id'', true), '''')::uuid)',
      t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE ON orders, order_lines TO cosmo_app;
GRANT SELECT, INSERT ON order_line_changes, order_status_history TO cosmo_app;
