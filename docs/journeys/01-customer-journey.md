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
      I choose a payment method: 4: Customer
      I place the order: 5: Customer
    section Waiting
      I see my order is being prepared: 4: Customer
      I see my order is out for delivery: 4: Customer
    section Receiving
      Driver hands me the goods: 5: Customer, Driver
      I pay cash to the driver: 4: Customer, Driver
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
    G -- Yes --> I[Order confirmed, stock reserved]
    I --> J[Customer follows the order status]
    J --> K[Driver delivers the goods]
    K --> L{Delivered?}
    L -- Yes --> M[Invoice appears in the customer's account]
    L -- No --> N[Wholesaler arranges a new delivery<br/>or cancels the order]
    M --> O[Customer pays, payment is recorded]
    O --> P[Customer sees an updated balance]
```

## What the customer sees at each order status

| Order status | What the customer sees | What the customer can do |
|---|---|---|
| Placed | "Order received" | Cancel the order |
| Preparing | "Being prepared" | Nothing. Contact the wholesaler to cancel |
| Ready | "Ready for delivery" | Nothing |
| Out for delivery | "On the way" | Nothing |
| Delivered | "Delivered" | See the invoice |
| Partially delivered | "Delivered in part", with the quantities | See the invoice |
| Delivery failed | "Delivery was not completed" | Contact the wholesaler |
| Cancelled | "Cancelled" | Order again |

## Moments that can go wrong

| Moment | Problem | How the plan handles it |
|---|---|---|
| Placing the order | A product ran out while the cart was open | The customer is told which product and how many are available (A-07) |
| Preparation | The warehouse finds less than ordered | The order continues with the smaller quantity, and the customer sees it (A-08) |
| Delivery | Nobody is at the pharmacy | The driver reports a failed delivery. The order is delivered again or cancelled (A-19) |
| After delivery | A product is damaged or wrong | The customer contacts the wholesaler, who records a return and a credit (A-09, A-22) |

## Related stories

[Customer stories](../user-stories/customer.md): CUS-01 to CUS-12.
