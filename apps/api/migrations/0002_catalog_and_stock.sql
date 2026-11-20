-- Phase 2: product catalog and stock.
-- See docs/technical/01-database-design.md, areas 2 and 3, and docs/workflows/10-product-fields.md.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TYPE product_type AS ENUM ('medicine', 'cosmetic');
CREATE TYPE applies_to AS ENUM ('medicine', 'cosmetic', 'both');
CREATE TYPE storage_kind AS ENUM ('room', 'fridge');
CREATE TYPE extra_field_type AS ENUM ('text', 'number', 'yes_no', 'date', 'choice');
CREATE TYPE price_type AS ENUM ('selling', 'cost');
CREATE TYPE offer_type AS ENUM ('discount', 'bonus');
CREATE TYPE stock_state AS ENUM ('sellable', 'damaged', 'expired', 'held');
CREATE TYPE movement_type AS ENUM (
  'opening', 'adjustment', 'damaged', 'lost', 'expired',
  'receipt', 'order_reserved', 'order_released', 'trip_started', 'delivery_failed_back',
  'customer_return', 'supplier_return', 'held', 'unheld'
);

-- Lists the owner and stock manager manage (C-74)
CREATE TABLE categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wholesaler_id uuid NOT NULL REFERENCES wholesalers(id),
  name_ar text NOT NULL,
  name_en text NOT NULL,
  applies_to applies_to NOT NULL DEFAULT 'both',
  is_active boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX categories_name ON categories (wholesaler_id, lower(name_en));

CREATE TABLE brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wholesaler_id uuid NOT NULL REFERENCES wholesalers(id),
  name_ar text NOT NULL,
  name_en text NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX brands_name ON brands (wholesaler_id, lower(name_en));

CREATE TABLE dosage_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wholesaler_id uuid NOT NULL REFERENCES wholesalers(id),
  name_ar text NOT NULL,
  name_en text NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX dosage_forms_name ON dosage_forms (wholesaler_id, lower(name_en));

CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wholesaler_id uuid NOT NULL REFERENCES wholesalers(id),
  product_type product_type NOT NULL,
  name_ar text NOT NULL,
  name_en text NOT NULL,
  barcode text,
  brand_id uuid NOT NULL REFERENCES brands(id),
  category_id uuid NOT NULL REFERENCES categories(id),
  unit text NOT NULL,
  pack_size text NOT NULL,
  cost_price numeric(12,2) NOT NULL CHECK (cost_price >= 0),
  selling_price numeric(12,2) NOT NULL CHECK (selling_price >= 0),
  image_url text,
  description text,
  track_batches boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  -- Names, barcode, and active ingredient in one text, for fast search in Arabic and English
  search_text text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX products_barcode ON products (wholesaler_id, barcode) WHERE barcode IS NOT NULL;
CREATE INDEX products_search ON products USING gin (search_text gin_trgm_ops);
CREATE INDEX products_list ON products (wholesaler_id, is_active, name_en);

CREATE TABLE medicine_details (
  product_id uuid PRIMARY KEY REFERENCES products(id),
  wholesaler_id uuid NOT NULL REFERENCES wholesalers(id),
  active_ingredient text NOT NULL,
  strength text NOT NULL,
  dosage_form_id uuid NOT NULL REFERENCES dosage_forms(id),
  storage storage_kind NOT NULL DEFAULT 'room',
  public_price numeric(12,2) CHECK (public_price IS NULL OR public_price >= 0),
  registration_number text,
  needs_prescription boolean
);

CREATE TABLE cosmetic_details (
  product_id uuid PRIMARY KEY REFERENCES products(id),
  wholesaler_id uuid NOT NULL REFERENCES wholesalers(id),
  shade_name text,
  shade_number text,
  suitable_for text,
  period_after_opening_months int CHECK (period_after_opening_months IS NULL OR period_after_opening_months BETWEEN 1 AND 120)
);

-- Fields the owner adds (C-71)
CREATE TABLE extra_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wholesaler_id uuid NOT NULL REFERENCES wholesalers(id),
  name_ar text NOT NULL,
  name_en text NOT NULL,
  field_type extra_field_type NOT NULL,
  choices jsonb NOT NULL DEFAULT '[]'::jsonb,
  applies_to applies_to NOT NULL DEFAULT 'both',
  is_required boolean NOT NULL DEFAULT false,
  shown_to_customers boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE extra_field_values (
  product_id uuid NOT NULL REFERENCES products(id),
  extra_field_id uuid NOT NULL REFERENCES extra_fields(id),
  wholesaler_id uuid NOT NULL REFERENCES wholesalers(id),
  value text NOT NULL,
  PRIMARY KEY (product_id, extra_field_id)
);

CREATE TABLE price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wholesaler_id uuid NOT NULL REFERENCES wholesalers(id),
  product_id uuid NOT NULL REFERENCES products(id),
  price_type price_type NOT NULL,
  old_price numeric(12,2),
  new_price numeric(12,2) NOT NULL,
  changed_by uuid REFERENCES users(id),
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX price_history_product ON price_history (product_id, changed_at DESC);

-- C-41: a discount or bonus units. Only one offer per product at a time.
CREATE TABLE offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wholesaler_id uuid NOT NULL REFERENCES wholesalers(id),
  product_id uuid NOT NULL REFERENCES products(id),
  offer_type offer_type NOT NULL,
  discount_percent numeric(5,2),
  buy_quantity int,
  free_quantity int,
  starts_on date,
  ends_on date,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  stopped_at timestamptz,
  CHECK (
    (offer_type = 'discount' AND discount_percent > 0 AND discount_percent < 100 AND buy_quantity IS NULL AND free_quantity IS NULL)
    OR (offer_type = 'bonus' AND discount_percent IS NULL AND buy_quantity >= 1 AND free_quantity >= 1)
  ),
  CHECK (starts_on IS NULL OR ends_on IS NULL OR starts_on <= ends_on)
);
CREATE UNIQUE INDEX offers_one_active ON offers (product_id) WHERE is_active;

-- Stock (docs/technical/01-database-design.md, area 3)
CREATE TABLE batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wholesaler_id uuid NOT NULL REFERENCES wholesalers(id),
  product_id uuid NOT NULL REFERENCES products(id),
  batch_number text,
  expiry_date date,
  qty_sellable int NOT NULL DEFAULT 0 CHECK (qty_sellable >= 0),
  qty_damaged int NOT NULL DEFAULT 0 CHECK (qty_damaged >= 0),
  qty_expired int NOT NULL DEFAULT 0 CHECK (qty_expired >= 0),
  qty_held int NOT NULL DEFAULT 0 CHECK (qty_held >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX batches_number ON batches (product_id, batch_number) WHERE batch_number IS NOT NULL;
-- A product without batch tracking has exactly one batch, with no number
CREATE UNIQUE INDEX batches_default ON batches (product_id) WHERE batch_number IS NULL;
CREATE INDEX batches_expiry ON batches (wholesaler_id, expiry_date) WHERE expiry_date IS NOT NULL;

CREATE TABLE product_stock (
  product_id uuid PRIMARY KEY REFERENCES products(id),
  wholesaler_id uuid NOT NULL REFERENCES wholesalers(id),
  on_hand_sellable int NOT NULL DEFAULT 0 CHECK (on_hand_sellable >= 0),
  reserved int NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  held int NOT NULL DEFAULT 0 CHECK (held >= 0),
  -- Two customers can never be promised the same units (C-25, C-54)
  CHECK (reserved <= on_hand_sellable)
);

-- The ledger (C-09). Rows are only ever added.
CREATE TABLE stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wholesaler_id uuid NOT NULL REFERENCES wholesalers(id),
  product_id uuid NOT NULL REFERENCES products(id),
  batch_id uuid REFERENCES batches(id),
  movement_type movement_type NOT NULL,
  stock_state stock_state,
  quantity_change int NOT NULL DEFAULT 0,
  reserved_change int NOT NULL DEFAULT 0,
  document_type text,
  document_id uuid,
  reason text,
  note text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stock_movements_product ON stock_movements (product_id, created_at DESC);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'categories', 'brands', 'dosage_forms', 'products', 'medicine_details', 'cosmetic_details',
    'extra_fields', 'extra_field_values', 'price_history', 'offers', 'batches', 'product_stock', 'stock_movements'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (wholesaler_id = nullif(current_setting(''app.wholesaler_id'', true), '''')::uuid) WITH CHECK (wholesaler_id = nullif(current_setting(''app.wholesaler_id'', true), '''')::uuid)',
      t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE ON
  categories, brands, dosage_forms, products, medicine_details, cosmetic_details,
  extra_fields, offers, batches, product_stock
TO cosmo_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON extra_field_values TO cosmo_app;
-- History: add and read only
GRANT SELECT, INSERT ON price_history, stock_movements TO cosmo_app;
