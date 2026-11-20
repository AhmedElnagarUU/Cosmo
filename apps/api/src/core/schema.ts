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

type ListRow = { id: Uuid; wholesaler_id: string; name_ar: string; name_en: string; is_active: Generated<boolean> };
export interface CategoriesTable extends ListRow {
  applies_to: Generated<'medicine' | 'cosmetic' | 'both'>;
}
export type BrandsTable = ListRow;
export type DosageFormsTable = ListRow;

export interface ProductsTable {
  id: Uuid;
  wholesaler_id: string;
  product_type: 'medicine' | 'cosmetic';
  name_ar: string;
  name_en: string;
  barcode: string | null;
  brand_id: string;
  category_id: string;
  unit: string;
  pack_size: string;
  cost_price: string;
  selling_price: string;
  image_url: string | null;
  description: string | null;
  track_batches: Generated<boolean>;
  is_active: Generated<boolean>;
  search_text: Generated<string>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface MedicineDetailsTable {
  product_id: string;
  wholesaler_id: string;
  active_ingredient: string;
  strength: string;
  dosage_form_id: string;
  storage: 'room' | 'fridge';
  public_price: string | null;
  registration_number: string | null;
  needs_prescription: boolean | null;
}

export interface CosmeticDetailsTable {
  product_id: string;
  wholesaler_id: string;
  shade_name: string | null;
  shade_number: string | null;
  suitable_for: string | null;
  period_after_opening_months: number | null;
}

export interface ExtraFieldsTable {
  id: Uuid;
  wholesaler_id: string;
  name_ar: string;
  name_en: string;
  field_type: 'text' | 'number' | 'yes_no' | 'date' | 'choice';
  choices: ColumnType<string[], string | undefined, string>;
  applies_to: 'medicine' | 'cosmetic' | 'both';
  is_required: boolean;
  shown_to_customers: boolean;
  is_active: Generated<boolean>;
  sort_order: Generated<number>;
  created_at: Generated<Date>;
}

export interface ExtraFieldValuesTable {
  product_id: string;
  extra_field_id: string;
  wholesaler_id: string;
  value: string;
}

export interface PriceHistoryTable {
  id: Uuid;
  wholesaler_id: string;
  product_id: string;
  price_type: 'selling' | 'cost';
  old_price: string | null;
  new_price: string;
  changed_by: string | null;
  changed_at: Generated<Date>;
}

export interface OffersTable {
  id: Uuid;
  wholesaler_id: string;
  product_id: string;
  offer_type: 'discount' | 'bonus';
  discount_percent: string | null;
  buy_quantity: number | null;
  free_quantity: number | null;
  starts_on: string | null;
  ends_on: string | null;
  is_active: Generated<boolean>;
  created_by: string | null;
  created_at: Generated<Date>;
  stopped_at: Timestamp | null;
}

export interface BatchesTable {
  id: Uuid;
  wholesaler_id: string;
  product_id: string;
  batch_number: string | null;
  expiry_date: string | null;
  qty_sellable: Generated<number>;
  qty_damaged: Generated<number>;
  qty_expired: Generated<number>;
  qty_held: Generated<number>;
  created_at: Generated<Date>;
}

export interface ProductStockTable {
  product_id: string;
  wholesaler_id: string;
  on_hand_sellable: Generated<number>;
  reserved: Generated<number>;
  held: Generated<number>;
}

export type MovementType =
  | 'opening' | 'adjustment' | 'damaged' | 'lost' | 'expired'
  | 'receipt' | 'order_reserved' | 'order_released' | 'trip_started' | 'delivery_failed_back'
  | 'customer_return' | 'supplier_return' | 'held' | 'unheld';

export interface StockMovementsTable {
  id: Uuid;
  wholesaler_id: string;
  product_id: string;
  batch_id: string | null;
  movement_type: MovementType;
  stock_state: 'sellable' | 'damaged' | 'expired' | 'held' | null;
  quantity_change: Generated<number>;
  reserved_change: Generated<number>;
  document_type: string | null;
  document_id: string | null;
  reason: string | null;
  note: string | null;
  created_by: string | null;
  created_at: Generated<Date>;
}

export interface DocumentCountersTable {
  wholesaler_id: string;
  doc_type: string;
  year: number;
  last_number: Generated<number>;
}
export interface SuppliersTable {
  id: Uuid;
  wholesaler_id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  address: string | null;
  is_active: Generated<boolean>;
  created_at: Generated<Date>;
}
export interface ReceiptsTable {
  id: Uuid;
  wholesaler_id: string;
  receipt_number: string | null;
  supplier_id: string;
  supplier_invoice_number: string | null;
  supplier_invoice_date: string | null;
  total_amount: Generated<string>;
  status: Generated<'draft' | 'confirmed'>;
  created_by: string | null;
  created_at: Generated<Date>;
  confirmed_by: string | null;
  confirmed_at: Timestamp | null;
}
export interface ReceiptLinesTable {
  id: Uuid;
  wholesaler_id: string;
  receipt_id: string;
  product_id: string;
  batch_number: string | null;
  expiry_date: string | null;
  batch_id: string | null;
  quantity: number;
  cost_price: string;
  line_order: Generated<number>;
}
export type SupplierReturnReason = 'expired' | 'near_expiry' | 'damaged' | 'wrong_product' | 'other';
export interface SupplierReturnsTable {
  id: Uuid;
  wholesaler_id: string;
  return_number: string;
  supplier_id: string;
  status: 'waiting_for_owner' | 'confirmed' | 'rejected';
  reason: SupplierReturnReason;
  note: string | null;
  total_value: Generated<string>;
  created_by: string | null;
  created_at: Generated<Date>;
  decided_by: string | null;
  decided_at: Timestamp | null;
  rejection_reason: string | null;
  confirmed_at: Timestamp | null;
}
export interface SupplierReturnLinesTable {
  id: Uuid;
  wholesaler_id: string;
  supplier_return_id: string;
  product_id: string;
  batch_id: string;
  stock_state: 'sellable' | 'damaged' | 'expired';
  quantity: number;
  cost_price: string;
}
export type PaymentMethod = 'cash' | 'bank_transfer' | 'instapay' | 'vodafone_cash' | 'other';
export interface SupplierPaymentsTable {
  id: Uuid;
  wholesaler_id: string;
  supplier_id: string;
  amount: string;
  method: PaymentMethod;
  paid_on: string;
  reference: string | null;
  recorded_by: string | null;
  created_at: Generated<Date>;
  cancelled_at: Timestamp | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
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
  categories: CategoriesTable;
  brands: BrandsTable;
  dosage_forms: DosageFormsTable;
  products: ProductsTable;
  medicine_details: MedicineDetailsTable;
  cosmetic_details: CosmeticDetailsTable;
  extra_fields: ExtraFieldsTable;
  extra_field_values: ExtraFieldValuesTable;
  price_history: PriceHistoryTable;
  offers: OffersTable;
  batches: BatchesTable;
  product_stock: ProductStockTable;
  stock_movements: StockMovementsTable;
  document_counters: DocumentCountersTable;
  suppliers: SuppliersTable;
  receipts: ReceiptsTable;
  receipt_lines: ReceiptLinesTable;
  supplier_returns: SupplierReturnsTable;
  supplier_return_lines: SupplierReturnLinesTable;
  supplier_payments: SupplierPaymentsTable;
}
