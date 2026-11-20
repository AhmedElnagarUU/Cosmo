-- Phase 8: customer returns and refunds. See docs/workflows/06-returns.md (C-19, C-60, C-62, C-63, C-69, C-82, C-83).

CREATE TABLE refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wholesaler_id uuid NOT NULL REFERENCES wholesalers(id),
  customer_return_id uuid NOT NULL REFERENCES customer_returns(id),
  customer_id uuid NOT NULL REFERENCES customers(id),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  method customer_payment_method NOT NULL CHECK (method IN ('cash', 'instapay', 'vodafone_cash')),
  reference text,
  refunded_on date NOT NULL,
  recorded_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refunds_customer ON refunds (customer_id);

ALTER TABLE customer_returns ADD CONSTRAINT customer_returns_left_over_choice CHECK (left_over_choice IS NULL OR left_over_choice IN ('refund', 'keep_as_credit'));

ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE refunds FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON refunds
  USING (wholesaler_id = nullif(current_setting('app.wholesaler_id', true), '')::uuid)
  WITH CHECK (wholesaler_id = nullif(current_setting('app.wholesaler_id', true), '')::uuid);
GRANT SELECT, INSERT ON refunds TO cosmo_app;
