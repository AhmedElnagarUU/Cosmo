# Inventory movements

Stock is never edited directly (C-09). Every change is a recorded movement with a type, a quantity, a batch, a date, and the employee who did it. The stock numbers are the sum of the movements.

## The three numbers

```mermaid
flowchart LR
    OH[On hand<br/>physically in the warehouse]
    R[Reserved<br/>promised to orders]
    AV[Available<br/>can still be ordered]

    OH -- minus --> R
    R -- equals --> AV
```

## Everything that changes stock

```mermaid
flowchart TD
    subgraph Increases on hand
        I1[Receiving from supplier]
        I2[Customer return, sellable]
        I3[Failed delivery, goods back]
        I4[Adjustment up, with reason]
    end

    subgraph Decreases on hand
        D1[Trip starts, goods leave]
        D2[Damaged or lost stock]
        D3[Expired stock removed]
        D4[Adjustment down, with reason]
    end

    subgraph Changes reserved only
        R1[Order placed: reserved up]
        R2[Order cancelled: reserved down]
        R3[Prepared less than ordered: reserved down]
    end

    STOCK[(Stock per product and batch)]

    I1 --> STOCK
    I2 --> STOCK
    I3 --> STOCK
    I4 --> STOCK
    STOCK --> D1
    STOCK --> D2
    STOCK --> D3
    STOCK --> D4
    R1 -.-> STOCK
    R2 -.-> STOCK
    R3 -.-> STOCK
```

| Movement | On hand | Reserved | Started by |
|---|---|---|---|
| Receiving from supplier | Up | | Warehouse confirms a receipt |
| Order placed | | Up | System |
| Order cancelled | | Down | System |
| Prepared less than ordered | | Down | System, at preparation |
| Trip starts | Down | Down | System, when the driver starts |
| Failed delivery, goods back | Up | Up if the order will be delivered again | Warehouse confirms |
| Customer return, sellable | Up | | Warehouse confirms |
| Customer return, damaged | Recorded as damaged, not sellable | | Warehouse confirms |
| Damaged, lost, or expired | Down | | Warehouse, with a reason |
| Manual adjustment | Up or down | | Manager, with a reason |

## Reservation and batches

A reservation is made against the product, not against a specific batch. The batch is chosen later by the warehouse employee during preparation (C-14). This keeps ordering fast and leaves the physical choice to the person holding the box.

## Rules that must always be true

- On hand is never negative.
- Reserved is never more than on hand.
- Available is never negative.
- Every movement can be traced to a document (receipt, order, trip, return, or adjustment) and an employee.
- Expired batches are not counted in available stock (A-17).

## Manual adjustment (C-10)

```mermaid
sequenceDiagram
    actor M as Manager
    participant S as System

    M->>S: Choose product and batch
    M->>S: Enter new counted quantity and a reason
    S->>S: Check the result does not go below reserved
    S->>S: Record an adjustment movement for the difference
    S-->>M: Stock updated, entry added to activity history
```
