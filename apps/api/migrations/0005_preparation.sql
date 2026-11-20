-- Phase 5: order preparation. See docs/workflows/03-order-preparation.md.

CREATE TABLE picks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wholesaler_id uuid NOT NULL REFERENCES wholesalers(id),
  order_line_id uuid NOT NULL REFERENCES order_lines(id),
  batch_id uuid NOT NULL REFERENCES batches(id),
  quantity int NOT NULL CHECK (quantity > 0),
  recommended_batch_id uuid REFERENCES batches(id),
  picked_by uuid REFERENCES users(id),
  picked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_line_id, batch_id)
);
CREATE INDEX picks_batch ON picks (batch_id);

ALTER TABLE picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE picks FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON picks
  USING (wholesaler_id = nullif(current_setting('app.wholesaler_id', true), '')::uuid)
  WITH CHECK (wholesaler_id = nullif(current_setting('app.wholesaler_id', true), '')::uuid);

-- Picks are replaced while preparing, so DELETE is allowed. After the trip starts the code never changes them.
GRANT SELECT, INSERT, UPDATE, DELETE ON picks TO cosmo_app;
