# Sub-plan 2 — Catalog and inventory

## Goal

The wholesaler has a product catalog and can see stock per product and per batch. Stock changes only through recorded movements.

## What a person can do at the end

- A manager creates and edits products and prices.
- Anyone in the warehouse can see on hand, reserved, and available for each product, and the batches behind it.
- A manager corrects stock with an adjustment and a reason.
- Warehouse staff record damaged, lost, or expired stock.

## In scope

- Products with their common fields and an active or inactive status
- Batch and expiry tracking, switched on per product (C-13)
- Stock per batch: on hand, reserved, available (C-08)
- Stock movements as the only way stock changes (C-09)
- Manual adjustments with a reason (C-10)
- Damaged, lost, and expired stock
- List of stock close to expiry and expired stock (A-17)
- Barcode search

## Not in scope

- Receiving from suppliers (phase 3). In this phase, opening stock is entered with an adjustment
- Reservation by orders (phase 4)
- Unit conversion (A-10)
- Customer-specific prices (C-06)

## Stories

MGR-05, MGR-06, MGR-07, WH-11, WH-12

## Workflow

[Inventory movements](../workflows/07-inventory-movements.md)

```mermaid
flowchart LR
    A[Manager creates a product] --> B[Stock is zero]
    B --> C[Adjustment or receiving adds stock to a batch]
    C --> D[Movement is recorded]
    D --> E[On hand, reserved, and available are recalculated]
```

## Depends on

Phase 1 (login and roles).

## Decisions to confirm before this phase

| ID | Question |
|---|---|
| O-05 | The exact product fields for pharmaceuticals and for cosmetics |
| O-06 | How many days before expiry is "near expiry" |
| A-10 | One selling unit per product, no conversion |
| A-17 | Expired batches cannot be sold |

## Done when

- Every story's acceptance checks pass.
- On hand is never negative, and reserved is never more than on hand.
- Every stock change shows who did it, when, and why.
- The project owner has tried it and approved.
