# User stories — Sales

The sales employee brings in customers and takes orders by phone or in person. Labels such as (A-13) point to [Decisions](../02-decisions.md).

### SAL-01 Add a customer
As a sales employee, I want to add a new pharmacy or store, so that they can start buying from us.

- I enter the business name, contact person, phone, and address (A-01).
- I cannot switch on "credit allowed". Only a manager can (A-14).

### SAL-02 Place an order for a customer
As a sales employee, I want to place an order on behalf of a customer, so that phone and WhatsApp orders are in the system.

- I choose the customer, then add products and quantities (A-13).
- I see the exact available quantity, unlike the customer.
- The order follows the same rules as a customer order: stock is checked and reserved automatically (C-11).
- The order shows that I placed it.

### SAL-03 See a customer's orders and balance
As a sales employee, I want to see a customer's orders, invoices, and balance, so that I can answer their questions.

- I can view but not change invoices or payments.

### SAL-04 Follow order progress
As a sales employee, I want to see where each order is, so that I can tell the customer when it will arrive.

- I see the current status and the history of status changes for each order.

### SAL-05 Start a return
As a sales employee, I want to start a return for a customer, so that the warehouse expects the goods.

- I choose the original invoice, then the products, quantities, and reason (C-19).
- I cannot return more than what was invoiced, minus earlier returns.
- The return waits for the warehouse to confirm the goods arrived (A-22).
