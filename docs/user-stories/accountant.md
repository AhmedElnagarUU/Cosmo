# User stories — Accountant

The accountant looks after money coming in from customers and going out to suppliers. Labels such as (A-15) point to [Decisions](../02-decisions.md).

## Customers

### ACC-01 See invoices
As an accountant, I want to see all invoices and filter them, so that I know what is unpaid.

- I can filter by customer, status, and date.
- Each invoice shows total, paid amount, and remaining amount.
- I can open the order behind an invoice.

### ACC-02 Record a customer payment
As an accountant, I want to record a payment against an invoice, so that the customer's balance is correct.

- I enter the amount, method, date, and a reference number (C-15, A-15).
- The amount cannot be more than the remaining amount of the invoice.
- The invoice status updates automatically (C-17).

### ACC-03 Record a partial payment
As an accountant, I want to record a payment smaller than the invoice total, so that part-payments are tracked.

- The invoice becomes Partially paid.
- I can add more payments later until it is Paid.

### ACC-04 See a customer's statement
As an accountant, I want a customer's full list of invoices, payments, and return credits, so that I can explain their balance.

- The list is in date order with a running balance.
- The final number equals the customer's balance.
- I can print it.

### ACC-05 Print an invoice
As an accountant, I want to print an invoice, so that I can give it to the customer.

- The printed invoice shows the wholesaler's details, the customer, the products, quantities, prices, and total.
- It works in Arabic and English (A-11).

## Suppliers

### ACC-06 Record a payment to a supplier
As an accountant, I want to record money we paid to a supplier, so that we know what we still owe.

- I enter the supplier, amount, method, and date.
- The supplier's balance decreases.
- Partial payments are allowed.

### ACC-07 See supplier balances
As an accountant, I want to see what we owe each supplier, so that I can plan payments.

- I see each supplier's total purchases, total paid, and balance.
- I can open the receipts and payments behind the balance.

## Cash and corrections

### ACC-08 Confirm cash from a driver
As an accountant, I want to confirm the cash a driver hands over after a trip, so that cash-on-delivery money is not lost.

- I see what the driver recorded as collected for each stop (A-16).
- I confirm the amount I received.
- A difference between the two amounts is highlighted and needs a note.
- Confirming closes the trip.

### ACC-09 Apply a return credit
As an accountant, I want a completed return to reduce the customer's balance, so that they are not charged for goods they sent back.

- The credit equals the invoice price of the returned goods (A-09).
- The credit appears on the customer's statement.
- Cash refunds are still open (O-09).

### ACC-10 Cancel a wrong payment
As an accountant, I want to cancel a payment recorded by mistake, so that the balance is correct.

- I must give a reason (C-10).
- The payment stays visible as cancelled. It is not deleted.
- The invoice status and balance are recalculated.
