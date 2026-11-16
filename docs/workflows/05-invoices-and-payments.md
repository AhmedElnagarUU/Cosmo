# Invoices and payments

## Two ways a customer pays (C-26)

```mermaid
flowchart TD
    Q{Is credit allowed<br/>for this customer?}
    Q -- No --> N[Customer pays when the order arrives<br/>cash, InstaPay, or Vodafone Cash]
    Q -- Yes --> Y{What did the customer<br/>choose at checkout?}
    Y -- Pay on arrival --> N
    Y -- Credit --> C[Customer receives the goods now<br/>and pays within the credit period]
    N --> P1[Delivery person records the payment]
    P1 --> P2[Accountant confirms or rejects]
    C --> P3[Customer pays the office later]
    P3 --> P4[Accountant records the payment]
```

| | Pay on arrival | Credit |
|---|---|---|
| Who can use it | Every customer | Only customers with "credit allowed" |
| When the money is paid | At the door | Later, before the due date |
| Who records it | Delivery person, then the accountant confirms | Accountant |
| Due date | The delivery day | Invoice date plus the customer's credit period (C-36) |

The credit period is set per customer. The default is one month, and the owner can change the default and each customer's period, for example to 15 days (C-26).

## When the invoice is created (C-58)

The owner chooses one of three moments in the settings. The default is "on delivered".

```mermaid
flowchart TD
    S{Invoice timing setting}
    S -- On accepted --> A[Invoice is created when the stock manager accepts the order<br/>Amount is what was ordered]
    S -- On prepared --> B[Invoice is created when preparation is confirmed<br/>Amount is what was prepared]
    S -- On delivered, default --> C[Invoice is created when delivery is confirmed<br/>Amount is what was delivered]
```

| Timing | Good | Bad |
|---|---|---|
| On accepted | The customer sees the amount early | Any change later (short stock, cancellation, failed delivery) means the invoice must be corrected or cancelled |
| On prepared | The invoice can be printed and sent with the goods | A failed delivery still needs the invoice to be cancelled |
| On delivered | The invoice always matches what the customer has | No printed invoice travels with the goods. A delivery note is used instead |

## Offers on the invoice (C-41)

| Offer | What the invoice shows |
|---|---|
| Discount | The normal price, the discount, and the price after discount for the line |
| Bonus units | The paid units at the normal price, and the free units as a separate line at price zero |

The invoice total is the amount after discounts.

## Items refused at the door (C-47)

The invoice covers the whole delivered order. The refused items are recorded as a return, and the return credit is taken off at once. The delivery person collects the invoice total minus that credit, so the customer pays only for what they kept.

## Payment statuses (C-27)

```mermaid
stateDiagram-v2
    [*] --> WaitingForConfirmation: Delivery person records a payment
    [*] --> Confirmed: Accountant records a payment directly
    WaitingForConfirmation --> Confirmed: Accountant confirms the money arrived
    WaitingForConfirmation --> Rejected: Accountant rejects with a reason
    Confirmed --> Cancelled: Accountant cancels a mistake with a reason
    Confirmed --> [*]
    Rejected --> [*]
    Cancelled --> [*]
```

Only a **confirmed** payment changes the invoice status and the customer's balance.

## Invoice statuses

```mermaid
stateDiagram-v2
    [*] --> Unpaid: Invoice created
    Unpaid --> PartiallyPaid: Confirmed payment smaller than the total
    Unpaid --> Paid: Confirmed payment equal to the total
    PartiallyPaid --> PartiallyPaid: Another partial payment
    PartiallyPaid --> Paid: Remaining amount paid
    Unpaid --> Cancelled: Order cancelled before delivery
    Paid --> [*]
    Cancelled --> [*]
```

The status is calculated from the confirmed payments. Nobody sets it by hand.

An unpaid or partially paid credit invoice that is past its due date is shown as **overdue**. Overdue is a warning, not a status change, and it does not block the customer (C-33).

## Payment collected at delivery

```mermaid
sequenceDiagram
    actor C as Customer
    actor D as Delivery person
    participant S as System
    actor A as Accountant
    actor O as Owner

    C->>D: Pays by cash, InstaPay, or Vodafone Cash
    D->>S: Record method, amount, and reference number
    S->>S: Save payment as waiting for confirmation
    Note over D,A: After the trip
    alt Cash
        D->>A: Hand over the cash
    else InstaPay or Vodafone Cash
        A->>A: Check the wholesaler's account for the transfer
    end
    alt Money arrived
        A->>S: Confirm the payment
        S->>S: Update invoice status and customer balance
    else Money did not arrive
        A->>S: Reject the payment and write a reason
        S->>S: Invoice stays unpaid
        S-->>O: Alert with the reason
    end
```

## Payment made to the office

```mermaid
sequenceDiagram
    actor A as Accountant
    participant S as System

    A->>S: Open the customer's unpaid invoices
    A->>S: Choose an invoice
    A->>S: Enter amount, method, date, reference number
    S->>S: Check the amount is not more than the remaining amount
    S->>S: Save a confirmed payment, recalculate invoice status and customer balance
    S-->>A: Updated invoice and balance
```

## Balances

```mermaid
flowchart LR
    subgraph CUST[Customer balance]
        I[Invoices] -- increase --> CB[What the customer owes]
        P[Confirmed payments] -- decrease --> CB
        R[Return credits] -- decrease --> CB
    end

    subgraph SUPP[Supplier balance]
        PI[Purchase invoices] -- increase --> SB[What we owe the supplier]
        SP[Supplier payments] -- decrease --> SB
    end
```

A balance is never typed in. It is always calculated from the documents behind it, so it can be explained line by line.

## Rules

| Rule | Decision |
|---|---|
| Each payment belongs to one invoice | C-59 |
| A payment cannot be larger than the remaining amount of the invoice | |
| A payment from a delivery person counts only after the accountant confirms it | C-27 |
| A rejected payment needs a reason and alerts the owner | C-27, C-30 |
| A saved payment cannot be edited. A wrong payment is cancelled with a reason and recorded again | C-10 |
| The due date of a credit invoice is the invoice date plus the customer's credit period | C-26, C-36 |
| Overdue invoices are shown to the owner and accountant. Nothing is blocked automatically | C-33 |
| Invoices can be printed | |
| Invoices keep the price from the moment the order was placed, even if the product price changes later | |
| No tax integration and no payment gateway | C-15, C-18 |

## Still open

- **O-09** — Cash refunds for returns.
