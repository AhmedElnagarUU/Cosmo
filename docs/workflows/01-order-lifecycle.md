# Order lifecycle

This is the most important workflow. It shows every status an order can have and what moves it to the next one.

Labels in brackets, such as (C-24), point to [Decisions](../02-decisions.md).

## Order statuses

```mermaid
stateDiagram-v2
    [*] --> Placed: Customer or sales places order, stock is reserved
    Placed --> Accepted: Stock manager accepts
    Placed --> Rejected: Stock manager rejects with a reason
    Accepted --> Preparing: Stock manager opens the order
    Preparing --> Ready: Stock manager confirms preparation
    Ready --> OutForDelivery: Delivery person starts the trip
    OutForDelivery --> Delivered: Delivery person confirms delivery
    OutForDelivery --> PartiallyDelivered: Customer accepts only some items
    OutForDelivery --> DeliveryFailed: Delivery person reports failure with reason
    DeliveryFailed --> Ready: Stock manager confirms goods are back
    DeliveryFailed --> Cancelled: Cancelled after goods are back
    Placed --> Cancelled: Customer cancels
    Accepted --> Cancelled: Customer, stock manager, or owner cancels
    Preparing --> Cancelled: Stock manager or owner cancels
    Ready --> Cancelled: Stock manager or owner cancels
    Delivered --> [*]
    PartiallyDelivered --> [*]
    Rejected --> [*]
    Cancelled --> [*]
```

| Status | Meaning | Who causes it |
|---|---|---|
| Placed | The order is waiting for acceptance. Its stock is already reserved | Customer or sales (C-25) |
| Accepted | The wholesaler agreed to fulfil the order | Stock manager or owner (C-24) |
| Rejected | The wholesaler refused the order, with a reason the customer sees | Stock manager or owner (C-24) |
| Preparing | The stock manager is picking the order | The system, when the order is opened |
| Ready | The order is packed and waiting for a trip | Stock manager confirms preparation |
| Out for delivery | The goods have left the warehouse | Delivery person starts the trip |
| Delivered | The customer received everything | Delivery person |
| Partially delivered | The customer received some items | Delivery person (O-10) |
| Delivery failed | The delivery did not happen | Delivery person, with a reason |
| Cancelled | The order will not be fulfilled | Customer, stock manager, or owner (A-06) |

People press a button only for real decisions and real-world actions: placing, accepting or rejecting, confirming preparation, starting the trip, and reporting the delivery result.

## Who handles the order at each step

```mermaid
flowchart LR
    A[Customer<br/>places order] --> B[Stock manager<br/>accepts or rejects]
    B --> C[Stock manager<br/>prepares]
    C --> D[Delivery manager<br/>assigns to a delivery person]
    D --> E[Delivery person<br/>delivers and collects payment]
    E --> F[Accountant<br/>confirms the payment]
```

## What happens to stock at each step

Example: a product has 100 units, and customer A orders 70.

| Step | On hand | Reserved | Available | Decision |
|---|---|---|---|---|
| Before the order | 100 | 0 | 100 | |
| Customer A places an order for 70 | 100 | 70 | 30 | C-25 |
| Customer B tries to order 50 | 100 | 70 | 30 | Refused. Only 30 are available (A-07) |
| Stock manager accepts A's order | 100 | 70 | 30 | No change |
| Preparation confirmed | 100 | 70 | 30 | Batches are now chosen |
| Delivery person starts the trip | 30 | 0 | 30 | C-25 |
| Delivered | 30 | 0 | 30 | |

On hand stays at 100 until the goods leave, because the boxes are still on the shelf. Available drops at once, so two customers can never be promised the same stock.

Other cases:

| Case | Effect on stock |
|---|---|
| Order rejected | Reserved decreases by 70. Available returns to 100 (C-12) |
| Order cancelled before the trip starts | Reserved decreases by 70. Available returns to 100 (C-12) |
| Only 60 of 70 are prepared | Reserved decreases by 10 at confirmation. The order continues with 60 (A-08) |
| Delivery failed, goods are back | On hand increases by 70. If the order will be delivered again, reserved increases by 70 too (A-19) |

## Placing and accepting an order

```mermaid
sequenceDiagram
    actor C as Customer
    participant S as System
    actor K as Stock manager
    actor O as Owner

    C->>S: Add products to cart
    C->>S: Choose payment method and place order
    S->>S: Check available quantity for every product
    alt Not enough stock for a product
        S-->>C: Show which product is short and how many are available
    else Enough stock for every product
        S->>S: Create order and reserve stock together
        S-->>C: Order received, waiting for acceptance
        S-->>K: New order appears for a decision
        alt Stock manager accepts
            K->>S: Accept
            S-->>C: Order accepted
            S-->>K: Order moves to the preparation list
        else Stock manager rejects
            K->>S: Reject and write a reason
            S->>S: Release the reserved stock
            S-->>C: Order rejected, with the reason
            S-->>O: Alert with the stock manager's name and the reason
        end
    end
```

Creating the order and reserving the stock happen as one action. Either both succeed or neither does. If two customers order the last units at the same moment, only one order succeeds.

## Cancellation rules (A-06)

```mermaid
flowchart TD
    Q1{What is the order status?}
    Q1 -- Placed or Accepted --> R1[Customer, stock manager, or owner can cancel<br/>Reservation is released]
    Q1 -- Preparing or Ready --> R2[Only the stock manager or owner can cancel<br/>Reservation is released<br/>Goods go back on the shelf]
    Q1 -- Out for delivery --> R3[Cannot cancel<br/>Delivery person reports the delivery as failed instead]
    Q1 -- Delivered --> R4[Cannot cancel<br/>Use a return instead]
```

A cancellation by an employee needs a reason and sends an alert to the owner (C-30).

If an invoice already exists when an order is cancelled, the invoice is cancelled too. This can only happen when invoice timing is set to "on accepted" or "on prepared" (A-05).

## Still open

- **O-11** — What happens if nobody accepts an order for a long time? The stock stays reserved while it waits. Options: show a warning on the owner's dashboard after some hours, or cancel the order automatically after a set time.
