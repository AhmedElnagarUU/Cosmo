# Receiving goods from a supplier

There is no purchase order (C-04). The wholesaler orders from suppliers outside the app, by phone or WhatsApp. The app records only what actually arrived. The supplier's invoice comes with the goods, so both are recorded in one step (C-43).

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
    actor W as Stock manager
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
| An expiry date in the past is rejected | C-55 |
| The same batch number received again for the same product is added to the existing batch | |
| The supplier's invoice number and total are entered on the same receipt as the goods | C-43 |
| A new cost price on a receipt updates the product's cost price. Old prices stay in the history | C-75 |
| Supplier payments can be partial | |
| Goods sent back to a supplier are recorded as a [supplier return](09-supplier-returns.md) | C-42 |


