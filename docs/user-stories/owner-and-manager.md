# User stories — Owner and manager

The owner can do everything. The manager runs daily operations but cannot change settings or employees. Labels such as (A-05) point to [Decisions](../02-decisions.md).

## Setting up

### MGR-01 Manage employees (owner only)
As an owner, I want to add employees and give each one a role, so that everyone sees only what they need.

- I can add an employee with a name, phone, and one role (C-22).
- I can deactivate an employee. A deactivated employee cannot log in.
- An employee's past actions stay in the history after deactivation.

### MGR-02 Business settings (owner only)
As an owner, I want to set how my business works, so that the app matches my way of working.

- I can choose when invoices are created: on order placed, on prepared, or on delivered (A-05).
- I can set how many days before expiry counts as "near expiry" (O-06).
- A changed setting applies to new orders only.

### MGR-03 Create customer accounts
As a manager, I want to create an account for a pharmacy or store, so that they can start ordering.

- I enter the business name, contact person, phone, and address (A-01).
- I can switch "credit allowed" on or off for each customer (A-14).
- The customer gets a way to log in for the first time.

### MGR-04 Deactivate a customer
As a manager, I want to deactivate a customer, so that they can no longer place orders.

- A deactivated customer cannot log in.
- Their orders, invoices, and balance stay visible to me.

## Products and stock

### MGR-05 Manage products
As a manager, I want to create and edit products, so that the catalog is correct.

- I can enter name, barcode, brand, category, unit, cost price, selling price, and description.
- I can switch batch and expiry tracking on per product (C-13).
- I can make a product inactive. Inactive products are hidden from customers.
- The exact list of fields per product type is still open (O-05).

### MGR-06 Change a price
As a manager, I want to change a product's selling price, so that it stays up to date.

- The new price applies to new orders only.
- Orders already placed keep their original price.
- The price change is recorded in the activity history.

### MGR-07 Adjust stock
As a manager, I want to correct a stock quantity after a physical count, so that the system matches the shelf.

- I must enter a reason (C-10).
- The adjustment is saved as a stock movement. The old number is not overwritten (C-09).
- I cannot reduce stock below the reserved quantity.

## Orders and delivery

### MGR-08 See and cancel orders
As a manager, I want to see all orders and cancel one when needed, so that I can solve problems.

- I can filter orders by status, customer, and date.
- I can cancel an order until its trip starts, and I must give a reason (A-06).
- Cancelling releases the reserved stock (C-12).

### MGR-09 Plan delivery trips
As a manager, I want to group ready orders into a trip and assign a driver, so that deliveries are organized.

- I see all orders that are Ready.
- I can select several orders, assign one driver, and arrange the stops in order (C-20).
- An order cannot be in two active trips.
- I can change a trip until the driver starts it.

## Watching the business

### MGR-10 Dashboard
As a manager, I want one screen that shows what needs attention today, so that I can act quickly.

- I see orders waiting for preparation, orders ready for delivery, and trips in progress.
- I see failed deliveries that need a decision.
- I see products that are out of stock or close to expiry.
- I see total unpaid customer invoices and total owed to suppliers.

### MGR-11 Activity history
As a manager, I want to see who did what and when, so that I can investigate mistakes.

- I see stock adjustments, cancellations, batch overrides, price changes, and payment cancellations.
- Each entry shows the employee, the date and time, and the reason.
- Entries cannot be edited or deleted.

### MGR-12 Basic reports
As a manager, I want a few simple reports, so that I understand how the business is doing.

- Sales by period, by product, and by customer.
- Current stock value.
- Customer balances and supplier balances.
- Stock close to expiry.
