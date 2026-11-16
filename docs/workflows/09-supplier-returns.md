# Supplier returns

The wholesaler can send goods back to a supplier, for example expired or damaged goods (C-42). The return corrects both the stock and the amount owed to the supplier.

## The flow

```mermaid
flowchart TD
    A[Stock manager opens a new supplier return<br/>and chooses the supplier] --> B[For each product, stock manager chooses<br/>the batch and the quantity]
    B --> C[Stock manager chooses a reason]
    C --> D[Stock manager confirms when the goods leave]
    D --> E[System decreases on-hand stock of the batch]
    D --> F[System records a stock movement for each line]
    D --> G[System decreases the amount owed to the supplier]
    G --> H[Accountant sees the return<br/>on the supplier's balance]
```

## Return reasons

- Expired
- Close to expiry
- Damaged
- Wrong product delivered
- Other (with a note)

## Rules

| Rule | Decision |
|---|---|
| A reason is required | C-42 |
| The quantity cannot be more than the on-hand stock of the batch that is not reserved | C-08 |
| Expired and damaged stock can be returned, even though it cannot be sold | C-55 |
| The value of the return is the cost price from the receipt of that batch | |
| The supplier's balance decreases by that value | C-42 |
| If the supplier sends new goods in exchange, they are recorded as a normal receipt | C-42 |
| A confirmed supplier return cannot be edited | C-09 |

## Still to decide

- Can the stock manager return goods to a supplier alone, or must the owner approve it first?
