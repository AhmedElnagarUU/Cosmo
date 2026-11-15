# Employee journeys

A typical day for each role inside the wholesaler.

## How the roles hand work to each other

One order passes through several people. Each person only does their own decision or real-world action. The system does the rest.

```mermaid
sequenceDiagram
    actor C as Customer
    participant S as System
    actor K as Stock manager
    actor M as Delivery manager
    actor D as Delivery person
    actor A as Accountant
    actor O as Owner

    C->>S: Place order
    S-->>K: New order to decide
    K->>S: Accept
    K->>S: Confirm preparation
    S-->>M: Order is ready
    M->>S: Create trip and assign delivery person
    S-->>D: Trip appears
    D->>S: Start trip
    D->>S: Mark delivered and record payment
    S-->>A: Payment waiting for confirmation
    A->>S: Confirm payment
    S-->>C: Updated invoice and balance
    S-->>O: Every step appears on the activity screen
```

## Stock manager

```mermaid
journey
    title A day as stock manager
    section Morning
      Review new orders: 4: Stock manager
      Accept or reject each order: 4: Stock manager
      Receive a supplier delivery: 3: Stock manager
      Enter batches and expiry dates: 3: Stock manager
    section Preparing orders
      Open the oldest accepted order: 5: Stock manager
      Pick products with the recommended batch: 4: Stock manager
      Record a short quantity: 3: Stock manager
      Confirm preparation: 5: Stock manager
    section Afternoon
      Take back goods from a failed delivery: 3: Stock manager
      Check goods a customer returned: 3: Stock manager
      Review stock close to expiry: 4: Stock manager
```

Receiving and entering batches score lowest because they involve the most typing. Barcode scanning and remembering the last cost price should reduce that work.

The stock manager has the most tasks of any role. If the wholesaler grows, this is the first role to split into two.

## Delivery manager

```mermaid
journey
    title A day as delivery manager
    section Morning
      See orders ready for delivery: 5: Delivery manager
      Group orders into trips: 4: Delivery manager
      Assign each trip to a delivery person: 4: Delivery manager
    section During the day
      Follow trips in progress: 4: Delivery manager
      Find who has a specific order: 5: Delivery manager
      See a failed delivery and its reason: 3: Delivery manager
    section End of day
      Plan failed orders into a new trip: 3: Delivery manager
```

## Delivery person

```mermaid
journey
    title A day on the road
    section At the warehouse
      Open my trip: 5: Delivery
      Load the goods: 4: Delivery
      Start the trip: 5: Delivery
    section On the road
      Find the customer: 3: Delivery
      Hand over the goods: 5: Delivery
      Mark delivered: 5: Delivery
      Record the payment collected: 4: Delivery
      Report a failed delivery: 3: Delivery
    section Back at the warehouse
      Return undelivered goods: 3: Delivery
      Hand over cash: 4: Delivery
```

## Accountant

```mermaid
journey
    title A day in accounts
    section Morning
      Review payments waiting for confirmation: 4: Accountant
      Check InstaPay and Vodafone Cash transfers: 3: Accountant
      Confirm or reject each payment: 4: Accountant
    section During the day
      Record a payment from a credit customer: 4: Accountant
      Answer a customer about their balance: 4: Accountant
      Record a supplier payment: 4: Accountant
    section End of day
      Receive cash from delivery people: 3: Accountant
      Check differences in cash: 2: Accountant
      Review overdue invoices: 3: Accountant
```

Cash differences are the hardest moment. The app must show clearly what the delivery person recorded against what the accountant received.

## Owner

```mermaid
journey
    title A day as owner
    section Morning
      Check the dashboard: 5: Owner
      Read alerts from yesterday: 4: Owner
    section During the day
      Add a new employee account: 4: Owner
      Allow credit for a trusted customer: 4: Owner
      Accept an order while the stock manager is away: 4: Owner
      Read why an order was rejected: 4: Owner
    section End of day
      Review the activity screen: 4: Owner
      Check overdue invoices and stock: 4: Owner
```

## Sales employee

```mermaid
journey
    title A day in sales
    section Calls
      Take an order by phone: 4: Sales
      Place the order for the customer: 4: Sales
    section Follow-up
      Tell a customer where their order is: 5: Sales
      Start a return for a customer: 3: Sales
      Add a new pharmacy: 4: Sales
```

## Related stories

- [Owner](../user-stories/owner.md)
- [Sales](../user-stories/sales.md)
- [Stock manager](../user-stories/stock-manager.md)
- [Delivery manager](../user-stories/delivery-manager.md)
- [Delivery](../user-stories/delivery.md)
- [Accountant](../user-stories/accountant.md)
