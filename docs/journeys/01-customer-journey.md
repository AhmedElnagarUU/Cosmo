# Customer journey

This follows one pharmacy from its first day on the platform to a paid order. The numbers in the journey diagram are a satisfaction score from 1 (painful) to 5 (easy). They show where the experience must be especially good.

## The journey

```mermaid
journey
    title A pharmacy orders from the wholesaler
    section Getting started
      Wholesaler creates my account: 4: Wholesaler
      I log in and set my password: 4: Customer
    section Ordering
      I search for products: 5: Customer
      I check price and stock status: 4: Customer
      I add products to my cart: 5: Customer
      I mark the products I must have: 4: Customer
      I choose a payment method: 4: Customer
      I place the order: 5: Customer
    section Waiting
      I wait for the wholesaler to accept: 3: Customer
      I answer a change to a must-have product: 2: Customer
      I see my order was accepted: 5: Customer
      I see my order is being prepared: 4: Customer
      I see my order is out for delivery: 4: Customer
    section Receiving
      Delivery person hands me the goods: 5: Customer, Delivery
      I pay the delivery person: 4: Customer, Delivery
    section After
      I check my invoice and balance: 4: Customer
      I order again: 5: Customer
```

## Step by step

```mermaid
flowchart TD
    A[Wholesaler creates the account] --> B[Customer logs in and sets a password]
    B --> C[Customer searches the catalog]
    C --> D[Customer adds products to the cart]
    D --> E[Customer chooses a payment method]
    E --> F[Customer places the order]
    F --> G{Enough stock?}
    G -- No --> H[Customer sees which product is short<br/>and changes the quantity]
    H --> F
    G -- Yes --> I[Order received, stock reserved]
    I --> Q{Stock manager accepts?}
    Q -- No --> R[Customer sees the rejection reason]
    Q -- Yes, with a must-have product reduced --> T{Customer accepts the change?}
    T -- No --> U[Order is cancelled]
    T -- Yes --> J
    Q -- Yes --> J[Customer follows the order status]
    J --> K[Delivery person delivers the goods]
    K --> L{Delivered?}
    L -- Yes --> M[Customer signs the paper<br/>Invoice appears in the customer's account]
    L -- No --> N[Wholesaler arranges a new delivery<br/>or cancels the order]
    M --> O[Customer pays on arrival, or later if on credit]
    O --> S[Accountant confirms the payment]
    S --> P[Customer sees an updated balance]
```

## What the customer sees at each order status

| Order status | What the customer sees | What the customer can do |
|---|---|---|
| Placed | "Waiting for acceptance" | Cancel the order |
| Accepted | "Accepted" | Cancel the order |
| Rejected | "Rejected", with the reason | Order again |
| Waiting for customer | "Waiting for your answer", with the change and the reason | Accept the change or cancel the order |
| Preparing | "Being prepared" | Nothing. Contact the wholesaler to cancel |
| Ready | "Ready for delivery" | Nothing |
| Out for delivery | "On the way" | Nothing |
| Delivered | "Delivered" | See the invoice, and any return for items refused at the door |
| Delivery failed | "Delivery was not completed" | Contact the wholesaler |
| Cancelled | "Cancelled", with the reason if the wholesaler cancelled | Order again |

## Moments that can go wrong

| Moment | Problem | How the plan handles it |
|---|---|---|
| Placing the order | A product ran out while the cart was open | The customer is told which product and how many are available (C-54) |
| Acceptance | The wholesaler rejects the order | The customer sees the reason and can order again (C-24) |
| Acceptance | The warehouse is closed | The customer sees "Closed now" and is told the order will be reviewed when it opens (C-37) |
| Acceptance | Nobody answers the order | After 5 working hours the owner is alerted. The order is never cancelled automatically (C-35) |
| Acceptance or preparation | A normal product is short | The order continues with the smaller quantity, and the customer sees the reason (C-38) |
| Acceptance or preparation | A must-have product is short | The order waits. The customer accepts the change or cancels (C-39) |
| Delivery | The customer refuses some items | The items are recorded as a return, and the customer pays only for what they kept (C-47) |
| Delivery | Nobody is at the pharmacy | The delivery person reports a failed delivery. The order is delivered again or cancelled (C-61) |
| Payment | The accountant cannot find the transfer | The payment is rejected with a reason, and the invoice stays unpaid (C-27) |
| After delivery | A product is damaged or wrong | The customer contacts the wholesaler, who records a return and a credit (C-60, C-62) |

## Related stories

[Customer stories](../user-stories/customer.md): CUS-01 to CUS-16.
