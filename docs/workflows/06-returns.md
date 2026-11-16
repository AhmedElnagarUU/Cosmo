# Customer returns

A return is its own document, linked to the original invoice (C-19). It corrects both the stock and the customer's balance.

## The flow

```mermaid
flowchart TD
    A[Customer wants to return goods] --> B[Employee finds the original invoice]
    B --> C[Employee selects products and quantities to return]
    C --> D[Employee chooses a reason]
    D --> E[Goods arrive at the warehouse]
    E --> F[Stock manager checks each product and its batch]
    F --> G{Condition of the goods?}
    G -- Good, can be sold again --> H[Add to sellable stock<br/>in the original batch]
    G -- Damaged or expired --> I[Add to damaged stock<br/>not available for sale]
    H --> J[Employee confirms the return]
    I --> J
    J --> K[System records stock movements]
    J --> L[System gives the customer a credit<br/>on their balance]
```

## Items refused at the door (C-47)

When a customer refuses some items during delivery, it is the same kind of return, started by the delivery person.

```mermaid
flowchart TD
    A[Customer refuses some items at the door] --> B[Delivery person records the items,<br/>quantities, and a reason]
    B --> C[System creates a return linked to the order]
    C --> D[Credit is applied at once<br/>Customer pays only for what they kept]
    C --> E[Goods come back with the trip]
    E --> F[Stock manager checks the goods]
    F --> G{Condition?}
    G -- Good --> H[Back to sellable stock]
    G -- Damaged --> I[Damaged stock]
```

The credit is applied at the door because the customer never kept the goods. The stock is corrected later, when the stock manager has the goods in hand.

## Return statuses

```mermaid
stateDiagram-v2
    [*] --> Requested: Employee creates the return
    Requested --> Received: Stock manager confirms goods arrived and their condition
    Received --> Completed: Credit applied to customer balance
    Requested --> Cancelled: Goods never arrived
    Completed --> [*]
    Cancelled --> [*]
```

A return for items refused at the door follows the same statuses. The only difference is that its credit is applied when it is created, not at the end.

## Return reasons

- Customer no longer needs the product
- Damaged product
- Wrong product
- Wrong quantity
- Expired product
- Refused at the door
- Other (with a note)

## Rules

| Rule | Decision |
|---|---|
| A return must point to an original invoice | C-19 |
| The returned quantity cannot be more than the quantity on the invoice, minus earlier returns | |
| The stock manager decides the condition: sellable or damaged | A-09 |
| Sellable goods go back into their original batch, with its original expiry date | |
| Damaged goods are recorded but never become available for sale | A-09 |
| The customer gets a credit equal to the invoice price of the returned goods | A-09 |
| An employee creates the return. The customer can view it | A-22 |
| Items refused at the door are a return created by the delivery person, with a reason | C-47 |
| For goods bought with a bonus offer, the credit per unit is the amount paid for the line divided by all its units, including the free ones | A-25 |

## Still open

- **O-09** — Can the customer get cash back, or only a credit?
- **A-25** — The bonus return rule above, or must the customer return the whole line?
- Is there a time limit for returns, for example 14 days after delivery?

Returns to a supplier are a different flow. See [Supplier returns](09-supplier-returns.md).
