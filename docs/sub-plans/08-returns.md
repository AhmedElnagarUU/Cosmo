# Sub-plan 8 — Returns

## Goal

When a customer sends goods back, the wholesaler records it once, and both the stock and the customer's balance are corrected.

## What a person can do at the end

- An employee starts a return from the original invoice.
- Items refused at the door become a return automatically, with the credit applied at once.
- The stock manager confirms the goods arrived and decides whether they can be sold again.
- The customer gets a credit on their balance and can see the return.

## In scope

- Returns linked to an invoice (C-19)
- Returns created from items refused at the door (C-47)
- Credit for goods bought with a bonus offer (A-25)
- Return reasons
- Condition check per product: sellable or damaged (A-09)
- Stock movements for returned goods, into the original batch
- Credit on the customer's balance (A-09)
- Limit: cannot return more than was invoiced, minus earlier returns

## Not in scope

- Returns to suppliers. They are built in phase 3 (C-42)
- Customers creating returns themselves (A-22)
- Cash refunds, unless O-09 is decided
- Exchange of one product for another. This is a return plus a new order

## Stories

SAL-05, STK-13, ACC-11, CUS-13

## Workflow

[Customer returns](../workflows/06-returns.md)

```mermaid
flowchart LR
    A[Employee starts a return<br/>from the invoice] --> B[Goods arrive]
    B --> C[Stock manager checks condition]
    C --> D[Stock is corrected]
    C --> E[Customer gets a credit]
```

## Depends on

Phase 7 (invoices and balances), phase 5 (which batch was sent to the customer).

## Decisions to confirm before this phase

| ID | Question |
|---|---|
| A-09 | Sellable or damaged, and credit on the balance |
| A-22 | Only employees create returns |
| O-09 | Cash refund or credit only |
| A-25 | Credit for returned goods bought with a bonus offer |

Also to decide here: whether returns have a time limit, and who approves a return of high value.

## Done when

- Every story's acceptance checks pass.
- A return can never exceed the invoiced quantity.
- Damaged goods never become available for sale.
- The customer's statement shows the return credit.
- The project owner has tried it and approved.
