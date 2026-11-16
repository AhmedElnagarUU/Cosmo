# Overview

## What we are building

A web platform that a wholesaler uses to run daily operations: products, stock, customers, suppliers, receiving goods, orders, warehouse preparation, delivery, invoices, payments, and returns.

The first industries are pharmaceuticals and cosmetics.

**Main principle: operational simplicity over enterprise complexity.** The system does everything it can work out by itself. People only confirm real-world actions (for example "I prepared this order") or make real decisions (for example "use this batch").

## The three parties

| Name | Who they are | In the app? |
|---|---|---|
| **Wholesaler** | The business that uses the platform, holds the stock, and sells to pharmacies and stores | Yes. The owner and employees log in |
| **Customer** | A pharmacy or cosmetics store that buys from the wholesaler | Yes. Each customer has a login |
| **Supplier** | A company that supplies goods to the wholesaler | No. Only a record that employees enter |

```mermaid
flowchart LR
    S[Supplier<br/>record only, no login]
    W[Wholesaler<br/>owner and employees]
    C[Customer<br/>pharmacy or store]

    S -- delivers goods --> W
    W -- pays --> S
    C -- places orders --> W
    W -- delivers goods --> C
    C -- pays --> W
```

## Roles inside the wholesaler

| Role | Main job in the app |
|---|---|
| Owner | Everything, including employee accounts, settings, prices, and credit |
| Sales (optional) | Add customers and place orders for them |
| Stock manager | Accept or reject orders, receive goods, manage stock, prepare orders |
| Delivery manager | Assign ready orders to delivery people and follow them |
| Accountant | Confirm payments, manage invoices and balances |
| Delivery | Deliver assigned orders and record the payment collected |

One employee can hold more than one role. The owner creates every employee account.

## The whole business in one picture

```mermaid
flowchart TD
    subgraph IN[Goods come in]
        A1[Supplier delivers goods] --> A2[Stock manager records what was received<br/>with batch and expiry]
        A2 --> A3[Stock increases]
        A2 --> A4[Amount owed to supplier increases]
    end

    subgraph SELL[Goods go out]
        B1[Customer places order] --> B2[System checks and reserves stock]
        B2 --> B7[Stock manager accepts or rejects]
        B7 --> B3[Stock manager prepares the order]
        B3 --> B8[Delivery manager assigns a delivery person]
        B8 --> B4[Delivery person delivers and collects payment]
        B4 --> B5[Invoice is created]
        B5 --> B6[Accountant confirms the payment]
    end

    subgraph BACK[Goods come back]
        C1[Customer returns goods] --> C2[Stock manager checks condition]
        C2 --> C3[Stock and customer balance are corrected]
    end

    A3 --> B2
    B4 --> C1
```

## Modules

1. Dashboard
2. Customer management
3. Product management
4. Inventory management
5. Supplier management
6. Purchasing and goods receiving
7. Order management
8. Warehouse preparation
9. Delivery management
10. Invoice management
11. Payment management
12. Returns management
13. Employee management
14. Basic reports and activity history

## What we are not building in the first version

- More than one warehouse
- GPS, live tracking of delivery people, automatic route planning
- Supplier login or supplier portal
- Different prices for different customers
- Customer credit limits
- Marketplace or sales to end consumers
- Pharmacy point-of-sale
- Purchase order workflow with suppliers
- Egyptian tax or e-invoicing integration
- Real payment gateway integration
- SMS, WhatsApp, or email notifications. Notifications are inside the app only
- Full accounting
- Controlled medicines that need special records
- Product variants. Each shade or size is its own product

## Glossary

| Term | Meaning |
|---|---|
| On hand | Units physically in the warehouse |
| Reserved | Units promised to orders that have not left the warehouse yet |
| Available | Units a customer can still order. Available = On hand − Reserved |
| Batch | One lot of a product, with its own batch number and expiry date |
| FEFO | "First expired, first out": use the batch that expires soonest |
| Stock movement | One recorded change to stock, with a reason. Stock is never edited directly |
| Receiving | Recording goods that a supplier delivered |
| Preparation | Picking and packing an order in the warehouse |
| Trip | One delivery person's outing, covering one or more orders |
| Stop | One customer delivery inside a trip |
| Credit period | The number of days a credit customer has to pay an invoice |
| Overdue | A credit invoice that is still unpaid after its due date |
| Must have | A product the customer marked as essential. If it is reduced or removed, the order waits for the customer's answer |
| Offer | A percent discount or bonus units on a product, set by the owner |
| Bonus units | Free units given with a purchase, for example "buy 10, get 1 free" |
| Working hours | The days and times the warehouse is open, set by the owner and shown to customers |
| Supplier return | Goods the wholesaler sends back to a supplier, with a reason |
| Signed paper | The delivery paper the customer signs as proof of delivery. It is kept outside the app |
| Balance | What a customer owes the wholesaler, or what the wholesaler owes a supplier |
