# Warehouse preparation

The warehouse employee works from a list of tasks. They do not manage order statuses. They do the physical work and confirm it.

## The flow

```mermaid
flowchart TD
    A[New order appears in the task list] --> B[Employee opens the task]
    B --> C[System shows each product<br/>with a recommended batch]
    C --> D[Employee picks the product from the shelf]
    D --> E{Is the recommended batch<br/>the one in hand?}
    E -- Yes --> F[Employee accepts the batch]
    E -- No --> G[Employee selects the batch they picked]
    F --> H{Full quantity found?}
    G --> H
    H -- Yes --> I[Next product]
    H -- No --> J[Employee enters the quantity found<br/>and a reason]
    J --> I
    I --> K{All products done?}
    K -- No --> D
    K -- Yes --> L[Employee confirms preparation]
    L --> M[Order becomes Ready]
```

## Batch recommendation (C-14, A-17)

```mermaid
flowchart TD
    A[System looks at all batches of the product] --> B[Remove expired batches]
    B --> C[Remove batches with no stock]
    C --> D[Sort by expiry date, soonest first]
    D --> E[Recommend the first batch]
    E --> F{Does it hold enough<br/>for the full quantity?}
    F -- Yes --> G[Recommend one batch]
    F -- No --> H[Recommend the first batch,<br/>then the next, until the quantity is covered]
```

The system only recommends. The employee always makes the final choice, because the employee is the one holding the physical box. An expired batch cannot be selected at all.

## Rules

| Rule | Decision |
|---|---|
| Opening a task moves the order to Preparing automatically | A-03 |
| One order line can be filled from more than one batch | |
| A barcode scan can select the product, where a scanner or phone camera is available | |
| If less than the ordered quantity is found, the employee enters a reason. The extra reservation is released | A-08 |
| If nothing at all can be prepared, the employee reports it and a manager cancels the order | A-06 |
| Batches close to expiry show a warning | A-17, O-06 |
| On-hand stock does not change at preparation. It changes when the trip starts | A-04 |

## Reasons for preparing less than ordered

- Stock not found on the shelf
- Stock damaged
- Stock expired
- Other (with a note)

A "not found" or "damaged" reason should also lead to a stock adjustment, so the numbers in the system match the shelf again.
