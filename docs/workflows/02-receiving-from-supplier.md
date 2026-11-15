# Receiving goods from a supplier

There is no purchase order (C-04). The wholesaler orders from suppliers outside the app, by phone or WhatsApp. The app records only what actually arrived.

## The flow

```mermaid
flowchart TD
    A[Supplier's goods arrive at the warehouse] --> B[Employee opens a new receipt<br/>and chooses the supplier]
    B --> C[For each product, employee enters<br/>quantity, cost price, batch number, expiry date]
    C --> D{Is the product new?}
    D -- Yes --> E[Employee creates the product first]
    E --> C
    D -- No --> F[Employee enters the supplier's invoice number and total]
    F --> G[Employee confirms the receipt]
    G --> H[System increases on-hand stock per batch]
    G --> I[System records a stock movement for each line]
    G --> J[System increases the amount owed to the supplier]
```

## Step by step

```mermaid
sequenceDiagram
    actor W as Warehouse employee
    participant S as System
    actor A as Accountant

    W->>S: Start receipt and choose supplier
    loop For each product delivered
        W->>S: Enter quantity, cost, batch number, expiry date
    end
    W->>S: Enter supplier invoice number and confirm
    S->>S: Increase stock, record movements, increase supplier balance
    S-->>W: Receipt saved
    Note over A,S: Later
    A->>S: Record a payment to the supplier
    S->>S: Decrease supplier balance
```

## Rules

| Rule | Decision |
|---|---|
| A confirmed receipt cannot be edited. A mistake is fixed with a stock adjustment that has a reason | C-09, C-10 |
| Batch number and expiry date are required for products that have batch tracking switched on | C-13 |
| An expiry date in the past is rejected | A-17 |
| The same batch number received again for the same product is added to the existing batch | |
| Supplier payments can be partial | |

## Still open

- **O-03** — Can the supplier's invoice arrive later than the goods? If yes, receiving and the purchase invoice become two separate steps.
- **O-02** — Can goods be sent back to a supplier?
