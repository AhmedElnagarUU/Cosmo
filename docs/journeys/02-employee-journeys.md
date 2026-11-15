# Employee journeys

A typical day for each role inside the wholesaler.

## How the roles hand work to each other

One order passes through several people. Each person only does their own real-world action. The system does the rest.

```mermaid
sequenceDiagram
    actor C as Customer
    participant S as System
    actor W as Warehouse
    actor M as Manager
    actor D as Driver
    actor A as Accountant

    C->>S: Place order
    S-->>W: Task appears
    W->>S: Confirm preparation
    S-->>M: Order is ready
    M->>S: Create trip and assign driver
    S-->>D: Trip appears
    D->>S: Start trip
    D->>S: Mark delivered and record cash
    S-->>A: Invoice and cash to confirm
    A->>S: Confirm cash and record payment
    S-->>C: Updated invoice and balance
```

## Warehouse employee

```mermaid
journey
    title A day in the warehouse
    section Morning
      Open the task list: 5: Warehouse
      Receive a supplier delivery: 3: Warehouse
      Enter batches and expiry dates: 3: Warehouse
    section Preparing orders
      Open the oldest task: 5: Warehouse
      Pick products with the recommended batch: 4: Warehouse
      Record a short quantity: 3: Warehouse
      Confirm preparation: 5: Warehouse
    section Afternoon
      Take back goods from a failed delivery: 3: Warehouse
      Check goods a customer returned: 3: Warehouse
      Review stock close to expiry: 4: Warehouse
```

Receiving and entering batches score lowest because they involve the most typing. Barcode scanning and remembering the last cost price should reduce that work.

## Driver

```mermaid
journey
    title A day on the road
    section At the warehouse
      Open my trip: 5: Driver
      Load the goods: 4: Driver
      Start the trip: 5: Driver
    section On the road
      Find the customer: 3: Driver
      Hand over the goods: 5: Driver
      Mark delivered: 5: Driver
      Record cash collected: 4: Driver
      Report a failed delivery: 3: Driver
    section Back at the warehouse
      Return undelivered goods: 3: Driver
      Hand over cash: 4: Driver
```

## Accountant

```mermaid
journey
    title A day in accounts
    section Morning
      Review unpaid invoices: 4: Accountant
      Record transfers received: 4: Accountant
    section During the day
      Answer a customer about their balance: 4: Accountant
      Record a supplier payment: 4: Accountant
    section End of day
      Confirm cash from drivers: 3: Accountant
      Check differences in cash: 2: Accountant
```

Cash differences are the hardest moment. The app must show clearly what the driver recorded against what the accountant received.

## Manager

```mermaid
journey
    title A day as manager
    section Morning
      Check the dashboard: 5: Manager
      Plan delivery trips: 4: Manager
    section During the day
      Add a new customer: 4: Manager
      Decide on a failed delivery: 3: Manager
      Cancel an order for a customer: 3: Manager
    section End of day
      Review the activity history: 4: Manager
      Check stock and expiry: 4: Manager
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

- [Warehouse](../user-stories/warehouse.md)
- [Driver](../user-stories/driver.md)
- [Accountant](../user-stories/accountant.md)
- [Owner and manager](../user-stories/owner-and-manager.md)
- [Sales](../user-stories/sales.md)
