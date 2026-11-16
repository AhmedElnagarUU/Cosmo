# User stories — Accountant

The accountant is responsible for the money. The delivery person says a payment was collected. The accountant confirms whether the money really arrived (C-27). Labels such as (A-15) point to [Decisions](../02-decisions.md).

## Customer payments

### ACC-01 See invoices
As an accountant, I want to see all invoices and filter them, so that I know what is unpaid.

- I can filter by customer, status, and date.
- Each invoice shows total, confirmed paid amount, amount waiting for confirmation, and remaining amount.
- I can open the order behind an invoice.

### ACC-02 Confirm or reject a payment from delivery
As an accountant, I want to check each payment a delivery person recorded, so that only real money counts as paid.

- I see a list of payments waiting for confirmation, with the delivery person's name, the customer, the method, the amount, and the reference number (C-27).
- For InstaPay and Vodafone Cash, I check that the money reached our account, then confirm.
- For cash, I confirm when the delivery person hands the cash to me.
- If the money did not arrive, I reject the payment and write a reason. The invoice stays unpaid, and the owner gets an alert (C-30).
- Only a confirmed payment changes the invoice status and the customer's balance.

### ACC-03 Receive cash after a trip
As an accountant, I want to see the cash each delivery person should hand over, so that no cash is lost.

- For each finished trip, I see the total cash the delivery person recorded.
- I enter the cash I actually received.
- A difference is highlighted and needs a note.
- The trip closes when every payment in it is confirmed or rejected, and the delivery manager has every signed paper (C-44).

### ACC-04 Record a payment directly
As an accountant, I want to record a payment a customer made to the office, so that credit customers and bank transfers are covered.

- I choose the invoice, then enter the amount, method, date, and reference number (C-15, A-15).
- The amount cannot be more than the remaining amount of the invoice.
- A payment I record myself is confirmed immediately.

### ACC-05 Record a partial payment
As an accountant, I want to record a payment smaller than the invoice total, so that part-payments are tracked.

- The invoice becomes Partially paid (C-17).
- I can add more payments later until it is Paid.

### ACC-06 See a customer's statement
As an accountant, I want a customer's full list of invoices, payments, and return credits, so that I can explain their balance.

- The list is in date order with a running balance.
- The final number equals the customer's balance.
- I can print it.

### ACC-07 Print an invoice
As an accountant, I want to print an invoice, so that I can give it to the customer.

- The printed invoice shows the wholesaler's details, the customer, the products, quantities, prices, total, and for credit invoices the due date.
- Discounts are shown on their line, and bonus units are shown at price zero (C-41).
- It works in Arabic and English (A-11).

### ACC-08 Follow overdue invoices
As an accountant, I want to see credit invoices that are past their due date, so that I can collect the money.

- The due date is the invoice date plus the customer's credit period (C-26, C-36).
- An unpaid invoice past its due date is marked overdue (C-33).
- I see overdue invoices grouped by customer, with the number of days late.
- The system does not block the customer. The owner decides what to do (C-33).

## Suppliers

### ACC-09 Record a payment to a supplier
As an accountant, I want to record money we paid to a supplier, so that we know what we still owe.

- I enter the supplier, amount, method, and date.
- The supplier's balance decreases.
- Partial payments are allowed.

### ACC-10 See supplier balances
As an accountant, I want to see what we owe each supplier, so that I can plan payments.

- I see each supplier's total purchases, total returns, total paid, and balance.
- A supplier return reduces what we owe (C-42).
- I can open the receipts, returns, and payments behind the balance.

## Corrections

### ACC-11 Apply a return credit
As an accountant, I want a completed return to reduce the customer's balance, so that they are not charged for goods they sent back.

- The credit equals the invoice price of the returned goods (A-09).
- For goods bought with a bonus offer, the credit per unit is the amount paid for the line divided by all its units (A-25).
- For items refused at the door, the credit is applied at once (C-47).
- The credit appears on the customer's statement.
- Cash refunds are still open (O-09).

### ACC-12 Cancel a wrong payment
As an accountant, I want to cancel a confirmed payment recorded by mistake, so that the balance is correct.

- I must give a reason (C-10).
- The payment stays visible as cancelled. It is not deleted.
- The invoice status and balance are recalculated.
