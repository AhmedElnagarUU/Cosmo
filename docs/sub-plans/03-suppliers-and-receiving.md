# Sub-plan 3 — Suppliers and receiving

## Goal

The wholesaler records goods delivered by suppliers. Stock goes up, and the amount owed to the supplier goes up.

## What a person can do at the end

- An employee keeps a list of suppliers.
- The stock manager records a delivery with quantities, cost prices, batches, and expiry dates.
- The stock manager records goods sent back to a supplier, with a reason.
- The accountant sees what is owed to each supplier and records payments.

## In scope

- Supplier records: name, contact, phone, address (C-03)
- Receipts: supplier, products, quantities, cost price, batch, expiry, and the supplier's invoice, all in one step (C-04, C-43)
- Supplier returns with a reason, which reduce stock and the supplier balance (C-42)
- Optional owner approval for supplier returns, as a setting (C-65)
- Stock increase and stock movements on confirmation
- Supplier balance, calculated from receipts, returns, and payments
- Supplier payments, including partial payments

## Not in scope

- Purchase orders (C-04)
- Supplier login (C-03)
- Comparing supplier prices

## Stories

STK-01, STK-02, STK-19, OWN-14, ACC-09, ACC-10

## Workflow

[Receiving goods from a supplier](../workflows/02-receiving-from-supplier.md) and [Supplier returns](../workflows/09-supplier-returns.md)

```mermaid
flowchart LR
    A[Goods arrive] --> B[Employee records the receipt]
    B --> C[Stock increases per batch]
    B --> D[Supplier balance increases]
    D --> E[Accountant records a payment]
    E --> F[Supplier balance decreases]
    C --> G[Stock manager returns goods<br/>to the supplier, with a reason]
    G --> F
```

## Depends on

Phase 2 (products, batches, stock movements).

## Decisions this phase depends on

Nothing is waiting. One-step receiving (C-43), supplier returns (C-42), and the approval setting (C-65) are confirmed.

Also to decide here: whether a new cost price on a receipt changes the product's cost price automatically.

## Done when

- Every story's acceptance checks pass.
- A confirmed receipt increases stock and the supplier balance together, or neither.
- A supplier's balance equals its receipts minus its returns and its payments.
- The project owner has tried it and approved.
