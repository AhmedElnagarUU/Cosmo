# Invoices and payments

## When the invoice is created (A-05)

The wholesaler chooses one of three moments in the settings. The default is "on delivered".

```mermaid
flowchart TD
    S{Invoice timing setting}
    S -- On order placed --> A[Invoice is created when the order is placed<br/>Amount is what was ordered]
    S -- On prepared --> B[Invoice is created when preparation is confirmed<br/>Amount is what was prepared]
    S -- On delivered, default --> C[Invoice is created when the driver confirms delivery<br/>Amount is what was delivered]
```

| Timing | Good | Bad |
|---|---|---|
| On order placed | The customer sees the amount immediately | Any change later (short stock, cancellation, failed delivery) means the invoice must be corrected or cancelled |
| On prepared | The invoice can be printed and sent with the goods | A failed delivery still needs the invoice to be cancelled |
| On delivered | The invoice always matches what the customer has | No printed invoice travels with the goods. A delivery note is used instead |

## Invoice statuses

```mermaid
stateDiagram-v2
    [*] --> Unpaid: Invoice created
    Unpaid --> PartiallyPaid: Payment smaller than the total
    Unpaid --> Paid: Payment equal to the total
    PartiallyPaid --> PartiallyPaid: Another partial payment
    PartiallyPaid --> Paid: Remaining amount paid
    Unpaid --> Cancelled: Order cancelled before delivery
    Paid --> [*]
    Cancelled --> [*]
```

The status is calculated from the payments. Nobody sets it by hand.

## Recording a customer payment

```mermaid
sequenceDiagram
    actor A as Accountant
    participant S as System

    A->>S: Open the customer's unpaid invoices
    A->>S: Choose an invoice
    A->>S: Enter amount, method, date, reference number
    S->>S: Check the amount is not more than the remaining amount
    S->>S: Save payment, recalculate invoice status and customer balance
    S-->>A: Updated invoice and balance
```

## Payment methods (C-16, A-14)

| Method | When the money arrives | Who records it |
|---|---|---|
| Cash on delivery | At the door | Driver records the cash. Accountant confirms the handover (A-16) |
| InstaPay | Before or after delivery | Accountant, with the reference number |
| Vodafone Cash | Before or after delivery | Accountant, with the reference number |
| Credit | Later | Accountant, when the customer pays. Only for customers with "credit allowed" (A-14) |
| Other | Any time | Accountant, with a note |

## Balances

```mermaid
flowchart LR
    subgraph Customer balance
        I[Invoices] -- increase --> CB[What the customer owes]
        P[Payments] -- decrease --> CB
        R[Return credits] -- decrease --> CB
    end

    subgraph Supplier balance
        PI[Purchase invoices] -- increase --> SB[What we owe the supplier]
        SP[Supplier payments] -- decrease --> SB
    end
```

A balance is never typed in. It is always calculated from the documents behind it, so it can be explained line by line.

## Rules

| Rule | Decision |
|---|---|
| Each payment belongs to one invoice | A-15 |
| A payment cannot be larger than the remaining amount of the invoice | |
| A saved payment cannot be edited. A wrong payment is cancelled with a reason and recorded again | C-10 |
| Invoices can be printed | |
| Invoices keep the price from the moment the order was placed, even if the product price changes later | |
| No tax integration and no payment gateway | C-15, C-18 |

## Still open

- **O-01** — Discounts and bonus units would change invoice lines.
- **O-09** — Cash refunds for returns.
