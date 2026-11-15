# User stories — Customer (pharmacy or store)

The customer mostly uses a phone. Labels such as (A-01) point to [Decisions](../02-decisions.md).

## Account

### CUS-01 First login
As a customer, I want to set my own password the first time I log in, so that only I can use my account.

- The wholesaler has already created my account (A-01).
- I receive a way to log in for the first time.
- I must choose a new password before I can do anything else.

### CUS-02 Reset password
As a customer, I want to reset my password if I forget it, so that I am not locked out.

- I can ask for a reset from the login screen.
- After the reset, my old password no longer works.

## Ordering

### CUS-03 Browse and search products
As a customer, I want to browse and search the catalog, so that I can find what I need quickly.

- I can search by name or barcode.
- I can filter by category and brand.
- I see only active products.
- The catalog works in Arabic and English (A-11).

### CUS-04 See product details
As a customer, I want to see a product's details and price, so that I can decide whether to order it.

- I see name, brand, unit, price, and description.
- I see "in stock" or "out of stock", not the exact quantity (A-18).
- The price is the same for every customer (C-06).

### CUS-05 Build a cart
As a customer, I want to add products to a cart and change quantities, so that I can prepare my order.

- I can add, change, and remove products.
- I see the total as I go.
- My cart is still there if I close the app and come back.

### CUS-06 Choose how to pay
As a customer, I want to choose a payment method at checkout, so that the wholesaler knows how I will pay.

- I can choose cash on delivery, InstaPay, Vodafone Cash, or another listed method (C-16).
- I see "credit" only if the wholesaler has allowed credit for me (A-14).

### CUS-07 Place the order
As a customer, I want to place my order and get a clear confirmation, so that I know it was received.

- If every product has enough stock, the order is confirmed immediately (A-03).
- If a product does not have enough stock, I am told which product and how many I can order (A-07).
- I see an order number after placing the order.
- Pressing the button twice does not create two orders.

### CUS-08 Follow my order
As a customer, I want to see the status of my orders, so that I know when to expect the goods.

- I see a list of my orders with their status.
- I see what was ordered and, if different, what was prepared (A-08).
- I see only my own orders.

### CUS-09 Cancel an order
As a customer, I want to cancel an order I placed by mistake, so that I do not receive goods I do not want.

- I can cancel only while the order is in the Placed status (A-06).
- After that, the cancel button is gone and I am told to contact the wholesaler.

## Money

### CUS-10 See my invoices and balance
As a customer, I want to see my invoices and how much I owe, so that I can plan my payments.

- I see each invoice with its total, paid amount, and status.
- I see my total balance.
- I can open and print an invoice.

### CUS-11 See my payments
As a customer, I want to see the payments the wholesaler has recorded for me, so that I can check they are correct.

- I see date, amount, method, and the invoice each payment belongs to.

## Returns

### CUS-12 See my returns
As a customer, I want to see my returns and the credit I received, so that I know my balance is correct.

- I see each return with its products, quantities, status, and credit amount.
- I cannot create a return in the app. I contact the wholesaler (A-22).
