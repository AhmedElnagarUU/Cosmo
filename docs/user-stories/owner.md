# User stories — Owner

The owner of the wholesale business can do everything in the app, including the work of every other role. The stories here are the ones only the owner does, or mainly the owner does. Labels such as (C-29) point to [Decisions](../02-decisions.md).

## Setting up

### OWN-01 Create employee accounts
As an owner, I want to create an account for each employee and give them a role, so that everyone sees only what their job needs.

- I enter the employee's name and a password, and choose one or more roles (C-29, C-31).
- The employee must change the password at their first login, so I do not know their real password (C-29).
- I can change an employee's roles later.
- I can deactivate an employee. A deactivated employee cannot log in.
- An employee's past actions stay in the history after deactivation.

### OWN-02 Business settings
As an owner, I want to set how my business works, so that the app matches my way of working.

- I can choose when invoices are created: on accepted, on prepared, or on delivered (A-05).
- I can set the default credit period, which starts at one month (C-26).
- I can set how many days before expiry counts as "near expiry" (O-06).
- A changed setting applies to new orders only.

### OWN-03 Create customer accounts
As an owner, I want to create an account for a pharmacy or store, so that they can start ordering.

- I enter the business name, contact person, phone, and address (A-01).
- The customer gets a way to log in for the first time.
- Sales employees can do this too (SAL-01).

### OWN-04 Allow credit for a customer
As an owner, I want to decide which customers can pay later and for how long, so that I control my risk.

- I can switch "credit allowed" on or off for each customer (C-26).
- I can set the credit period for each customer. It starts from my default, and I can change it, for example to 15 days.
- Only the owner can change these two settings.
- A change applies to new orders only.

### OWN-05 Deactivate a customer
As an owner, I want to deactivate a customer, so that they can no longer place orders.

- A deactivated customer cannot log in.
- Their orders, invoices, and balance stay visible to me.

## Products

### OWN-06 Manage products
As an owner, I want to create and edit products, so that the catalog is correct.

- I can enter name, barcode, brand, category, unit, cost price, selling price, and description.
- I can switch batch and expiry tracking on per product (C-13).
- I can make a product inactive. Inactive products are hidden from customers.
- The stock manager can create and edit products too, but cannot change prices (A-23).
- The exact list of fields per product type is still open (O-05).

### OWN-07 Change a price
As an owner, I want to change a product's selling price, so that it stays up to date.

- Only the owner can change a selling price (A-23).
- The new price applies to new orders only.
- Orders already placed keep their original price.
- The price change appears on the activity screen.

## Orders

### OWN-08 See all orders and step in
As an owner, I want to see every order and act on it when needed, so that work does not stop when an employee is away.

- I can filter orders by status, customer, and date.
- I can accept or reject an order myself (C-24).
- I can cancel an order until its trip starts, and I must give a reason (A-06).
- Cancelling releases the reserved stock (C-12).

## Watching the business

### OWN-09 Dashboard
As an owner, I want one screen that shows what needs attention today, so that I can act quickly.

- I see orders waiting for acceptance, with those waiting a long time marked clearly (C-35).
- I see orders being prepared, orders ready for delivery, and trips in progress.
- I see failed deliveries that need a decision.
- I see products that are out of stock or close to expiry.
- I see payments waiting for the accountant, overdue credit invoices, total unpaid invoices, and the total owed to suppliers.

### OWN-10 Activity screen
As an owner, I want to see who did what and when, so that I know who is working and can investigate mistakes.

- I see every important action with the employee's name, the date, and the time (C-30).
- This includes accepted and rejected orders, prepared orders, deliveries, payments, stock changes, and price changes.
- I can filter by employee, by date, and by type of action.
- Entries cannot be edited or deleted.

### OWN-11 Alerts for important events
As an owner, I want an alert when something important happens, so that I do not have to watch the activity screen all day.

- I get an alert inside the app for: a rejected order, a cancelled order, a stock correction, a payment the accountant rejected, and an order waiting a long time for acceptance (C-30, C-35).
- Each alert shows the employee's name and the reason they wrote.
- Ordinary actions do not create alerts. They appear only on the activity screen.
- Alerts outside the app, such as SMS or WhatsApp, are still open (O-08).

### OWN-12 Basic reports
As an owner, I want a few simple reports, so that I understand how the business is doing.

- Sales by period, by product, and by customer.
- Current stock value.
- Customer balances, with overdue amounts shown separately (C-33).
- Supplier balances.
- Stock close to expiry.
