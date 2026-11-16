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

- There are only a few settings, so the app stays clear (C-40).
- Working hours: I set the open days, the opening time, and the closing time. I also have a "closed today" switch for holidays (C-37).
- Default credit period: it starts at one month (C-26).
- Invoice timing: on accepted, on prepared, or on delivered (C-58).
- Near-expiry period: it starts at six months (C-45).
- Supplier return approval: off at the start. When I switch it on, every supplier return waits for my approval (C-65).
- A changed setting applies to new orders only.

### OWN-03 Create customer accounts
As an owner, I want to create an account for a pharmacy or store, so that they can start ordering.

- I enter the business name, contact person, phone, and address (C-48).
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

- I choose the product type first: medicine or cosmetic. The form shows only the fields for that type (C-66).
- For every product I enter the name in Arabic and English, barcode, brand, category, unit, pack size, cost price, selling price, image, and description.
- For a medicine I also enter the active ingredient, strength, dosage form, storage, public price, registration number, and whether it needs a prescription.
- For a cosmetic I can also enter the shade, what it is suitable for, and the period after opening.
- Each shade or size is its own product (C-67).
- I can switch batch and expiry tracking on per product (C-13).
- I can make a product inactive. Inactive products are hidden from customers.
- The stock manager can create and edit products too, but cannot change prices (C-64).
- The full list of fields is in [Product fields](../workflows/10-product-fields.md).

### OWN-07 Change a price
As an owner, I want to change a product's selling price, so that it stays up to date.

- Only the owner can change a selling price (C-64).
- The new price applies to new orders only.
- Orders already placed keep their original price.
- The price change appears on the activity screen.

### OWN-13 Manage offers
As an owner, I want to put a discount or bonus units on a product, so that I can sell more of it.

- I choose the product and the offer type: a percent discount, or bonus units such as "buy 10, get 1 free" (C-41).
- I can set a start date and an end date. Without dates, the offer runs until I stop it.
- The offer is the same for every customer (C-06).
- A product has only one active offer at a time.
- Orders already placed keep the offer they were placed with.
- Only the owner can create, change, or stop an offer.

### OWN-14 Approve a supplier return
As an owner, I want to approve or reject a supplier return before the goods leave, so that I control what goes back to suppliers.

- This applies only when I have switched on supplier return approval (C-65).
- I see the supplier, the products, batches, quantities, value, and the stock manager's reason.
- When I approve, the stock manager can confirm the return.
- When I reject, I must write a reason, and stock and the supplier balance do not change.
- When approval is off, I only get an alert after the stock manager confirms a return.

## Orders

### OWN-08 See all orders and step in
As an owner, I want to see every order and act on it when needed, so that work does not stop when an employee is away.

- I can filter orders by status, customer, and date.
- I can accept or reject an order myself (C-24).
- I can cancel an order until its trip starts, and I must give a reason (C-57).
- The customer gets a notification that the order was cancelled, with my reason (C-35).
- Cancelling releases the reserved stock (C-12).

## Watching the business

### OWN-09 Dashboard
As an owner, I want one screen that shows what needs attention today, so that I can act quickly.

- I see orders waiting for acceptance, with those waiting more than 5 working hours marked clearly (C-35).
- I see orders waiting for the customer's answer, with those waiting more than 5 working hours marked clearly (C-39).
- I see delivered orders whose signed paper has not come back (C-44).
- I see supplier returns waiting for my approval, when that setting is on (C-65).
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

- I get an alert inside the app for: a rejected order, a cancelled order, a stock correction, a payment the accountant rejected, an order or a customer answer waiting more than 5 working hours, and a missing signed delivery paper (C-30, C-35, C-39, C-44).
- Each alert shows the employee's name and the reason they wrote.
- Ordinary actions do not create alerts. They appear only on the activity screen.
- Alerts are inside the app only. There is no SMS or WhatsApp (C-46).

### OWN-12 Basic reports
As an owner, I want a few simple reports, so that I understand how the business is doing.

- Sales by period, by product, and by customer.
- Current stock value.
- Customer balances, with overdue amounts shown separately (C-33).
- Supplier balances.
- Stock close to expiry.
