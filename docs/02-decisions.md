# Decisions

This is the single list of business decisions. Every other document refers to these IDs.

- **CONFIRMED (C)** — decided by the project owner.
- **ASSUMED (A)** — a default chosen so planning can continue. Please confirm or change each one.
- **OPEN (O)** — not decided, and no default is safe.

## Confirmed

### Product and scope

| ID | Decision |
|---|---|
| C-01 | The platform is for wholesalers selling pharmaceuticals and cosmetics in Egypt |
| C-02 | Customers (pharmacies and stores) have real accounts and place their own orders |
| C-03 | Suppliers are records only. They have no login |
| C-04 | There is no purchase order workflow. Employees record what was actually received |
| C-05 | One warehouse per wholesaler |
| C-06 | One selling price per product for all customers |
| C-07 | No customer credit limits |
| C-18 | Invoices are internal documents. No tax or e-invoicing integration |
| C-23 | The frontend is Next.js and the backend is Express |
| C-40 | The app works one clear way, with few owner settings: working hours, default credit period, invoice timing, and the near-expiry period. The settings area is built so that more settings can be added later |
| C-46 | Notifications are inside the app only. No SMS, WhatsApp, or email. They are designed so that other channels can be added later without rebuilding |

### Stock

| ID | Decision |
|---|---|
| C-08 | Stock is tracked as on hand, reserved, and available. Available = On hand − Reserved |
| C-09 | Stock changes only through recorded movements, never by editing a number |
| C-10 | Every manual stock adjustment needs a reason and is recorded |
| C-11 | Reservation is automatic. Employees never reserve by hand |
| C-12 | Cancelling or rejecting an order releases its reservation |
| C-13 | Products can have batch and expiry tracking |
| C-14 | The system recommends a batch by expiry. The employee chooses and can override |
| C-42 | Goods can be returned to a supplier. The return records the product, batch, quantity, and a reason. Stock decreases, and the amount owed to the supplier decreases. If the supplier sends new goods in exchange, they are recorded as a normal receipt |
| C-43 | The supplier's invoice arrives with the goods. The goods and the invoice are recorded together in one step |
| C-45 | "Near expiry" means six months before the expiry date by default. The owner can change this in the settings |
| C-25 | Stock is reserved the moment the customer places the order, before acceptance. On hand decreases only when the goods leave the warehouse |

### Orders

| ID | Decision |
|---|---|
| C-24 | Orders are accepted by hand. The stock manager accepts or rejects each order, and the owner can too. A rejection needs a reason, and the customer sees it |
| C-32 | Sales employees can place an order for a customer |
| C-35 | An order that waits more than 5 working hours for acceptance is reported to the owner on the dashboard and as an alert. It is never cancelled automatically. The owner can cancel it with a reason, and the customer is notified |
| C-37 | The owner sets working hours: open days, opening time, and closing time, with a "closed today" switch. Customers see whether the warehouse is open or closed. Customers can place orders while it is closed, and they are told the order will be reviewed when it opens |
| C-38 | The stock manager can reduce a quantity or remove a product, when accepting an order or when preparing it. A reason is required. A quantity can never be increased. This replaces the old assumption A-08 |
| C-39 | The customer can mark products in the cart as "must have". If a normal product is reduced or removed, the order continues and the customer is informed. If a must-have product is reduced or removed, the order becomes "Waiting for customer", and the customer accepts the change or cancels the order. If the customer does not answer within 5 working hours, it is reported to the owner and not cancelled automatically |
| C-41 | The owner can put an offer on a product: a percent discount, or bonus units such as "buy 10, get 1 free". An offer is the same for every customer and can have a start and end date. Bonus units are reserved and delivered like normal units and appear on the invoice at price zero |

### Payment

| ID | Decision |
|---|---|
| C-15 | Payments are recorded by hand. No payment gateway |
| C-16 | Payment methods include cash on delivery, credit, InstaPay, Vodafone Cash, and others |
| C-17 | Invoice payment status is Unpaid, Partially paid, or Paid |
| C-26 | Each customer has a "credit allowed" switch. Without it, the customer pays when the order arrives: cash, InstaPay, or Vodafone Cash. With it, the customer pays later. The credit period is set per customer, with a default of one month that the owner can change |
| C-27 | The delivery person records the payment they collected. The accountant then confirms or rejects it. An invoice counts as paid only after the accountant confirms |
| C-33 | A credit invoice past its due date is shown as overdue to the owner and accountant. The system does not block the customer automatically |
| C-36 | The credit period starts on the invoice date |

### Delivery and returns

| ID | Decision |
|---|---|
| C-19 | Returns are their own module, linked to the original order or invoice |
| C-20 | Delivery uses trips with several orders, manual stop order, and a delivery view on the phone |
| C-21 | Delivery results are Delivered or Failed. A failure needs a reason |
| C-28 | The delivery manager assigns ready orders to delivery people and follows them |
| C-44 | Proof of delivery is a paper signed by the customer. The delivery person brings it back, and the delivery manager marks "signed paper received" for each order. Nothing is uploaded to the app. A missing paper is shown to the owner |
| C-47 | Items the customer refuses at the door are handled as a return, with a reason. There is no "Partially delivered" status |

### People

| ID | Decision |
|---|---|
| C-22 | Roles are Owner, Sales, Stock manager, Delivery manager, Accountant, Delivery. There is no separate Manager role |
| C-29 | The owner creates each employee account with a name and a password. The employee must change the password at first login |
| C-30 | The owner has an activity screen showing who did what and when. The owner gets an alert only for important events: a rejected order, a cancelled order, a stock correction, a payment the accountant rejected, an order or a customer answer waiting more than 5 working hours, and a missing signed delivery paper |
| C-31 | One employee can hold more than one role |
| C-34 | The stock manager also picks and packs orders. There is no separate warehouse worker role for now |

## Assumed — please confirm

| ID | Area | Assumed default | Why this default |
|---|---|---|---|
| A-01 | Customer onboarding | The wholesaler creates each customer account. The customer sets a password on first login | The wholesaler already knows its customers. No approval screen is needed |
| A-02 | Prototype | No throwaway prototype. We build the real app one flow at a time | Avoids writing the app twice. The diagrams validate the flows on paper first |
| A-05 | Invoice timing | A setting per wholesaler: on accepted, on prepared, or on delivered. Default is on delivered | The invoice then always matches what the customer really received |
| A-06 | Cancellation | A customer can cancel until preparation starts. The owner or stock manager can cancel until the trip starts | After preparation starts, people have already done physical work |
| A-07 | Shortage at order time | A customer cannot order more than the available quantity | Simplest rule. No backorders |
| A-09 | Return effect | The stock manager chooses whether returned goods go back to sellable stock or to damaged stock. The customer gets a credit on their balance | Covers both cases without a quarantine process |
| A-10 | Units | Each product is sold in one unit (for example "box"). No unit conversion | Conversion adds a lot of complexity |
| A-11 | Language and devices | Arabic and English, with right-to-left layout. Web app that works well on phones | Delivery people and pharmacies mostly use phones |
| A-12 | Tenancy | Many wholesalers use the same platform, each with fully separate data. A customer account belongs to one wholesaler | Matches "each wholesaler has an independent workspace" |
| A-15 | Payment allocation | Each payment is recorded against one invoice | Keeps invoice status simple and clear |
| A-17 | Expiry rules | Expired batches cannot be picked. Batches close to expiry show a warning | Protects against selling expired goods |
| A-18 | Stock shown to customers | Customers see "in stock" or "out of stock", not exact quantities | Hides the wholesaler's stock levels from customers |
| A-19 | Failed delivery | Goods come back to the warehouse. The stock manager confirms they are back, and the order is ready for a new trip or is cancelled | Stock stays correct after a failed delivery |
| A-20 | Technology | TypeScript on both sides and PostgreSQL as the database | Stock and money need strict transactions |
| A-22 | Who creates returns | An employee creates the return. Customers can see their returns but cannot create them | Returns need a physical check of the goods |
| A-23 | Permissions | Each role can do what the table in [User stories](user-stories/README.md) shows | Keeps roles few and simple |
| A-25 | Returning goods bought with a bonus offer | The credit for each returned unit is the amount paid for the line divided by all its units, including the free ones. The other choice is that the customer must return the whole line | The customer never gets back more than they paid, and can still return a part |

## Open — needs a decision

| ID | Area | Question | Why it matters |
|---|---|---|---|
| O-05 | Product fields | Which exact fields does each product type need? | Needed before the product screens are designed |
| O-09 | Refunds | Can a return be refunded in cash, or only as a credit on the balance? | Changes the payment module |

## Change history

| Change | What happened |
|---|---|
| Order acceptance | Was assumed automatic (A-03). Now confirmed manual, by the stock manager (C-24) |
| Stock deduction | Was assumed (A-04). Now confirmed (C-25) |
| Sales orders | Was assumed (A-13). Now confirmed (C-32) |
| Credit | Was assumed (A-14). Now confirmed with a credit period (C-26, C-33) |
| Cash on delivery | Was assumed (A-16). Now confirmed for every method collected at delivery (C-27) |
| Trip planning | Was assumed for the manager (A-21). Now confirmed for the new delivery manager role (C-28) |
| Roles | Manager removed. Stock manager replaces Warehouse. Delivery manager added. Driver renamed Delivery (C-22) |
| Permissions | Was open (O-07). Now a proposal to confirm (A-23) |
| Slow acceptance | Was open (O-11). Now confirmed: report to the owner (C-35) |
| Credit period start | Was assumed (A-24). Now confirmed (C-36) |
| Slow acceptance | The limit is now 5 working hours (C-35) |
| Working hours | New (C-37) |
| Preparing less than ordered | Was assumed (A-08). Now confirmed, and extended to acceptance, with "must have" products (C-38, C-39) |
| Settings | Confirmed: few settings, open for more later (C-40) |
| Discounts and bonus units | Was open (O-01). Now confirmed (C-41). The return rule is still to confirm (A-25) |
| Supplier returns | Was open (O-02). Now confirmed (C-42) |
| Purchase invoice timing | Was open (O-03). Now confirmed: one step (C-43) |
| Proof of delivery | Was open (O-04). Now confirmed: signed paper, checked by the delivery manager (C-44) |
| Near-expiry period | Was open (O-06). Now confirmed: six months by default (C-45) |
| Outside notifications | Was open (O-08). Now confirmed: inside the app only (C-46) |
| Items refused at the door | Was open (O-10). Now confirmed: handled as a return. "Partially delivered" is removed (C-47, C-21) |

## How decisions change

When the project owner confirms an assumption, it moves to the Confirmed table with a new C number. When an open item gets an answer, it moves to Confirmed too. Documents that mention the old ID are updated in the same change.
