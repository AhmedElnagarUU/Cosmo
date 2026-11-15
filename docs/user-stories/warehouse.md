# User stories — Warehouse

The warehouse employee works from tasks. The screens must need as few taps as possible. Labels such as (C-14) point to [Decisions](../02-decisions.md).

## Receiving

### WH-01 Receive goods from a supplier
As a warehouse employee, I want to record the goods a supplier delivered, so that the stock is correct.

- I choose the supplier and add each product with its quantity and cost price (C-04).
- I can scan a barcode to find the product.
- When I confirm, on-hand stock increases and the amount owed to the supplier increases.
- A confirmed receipt cannot be edited (C-09).

### WH-02 Record batch and expiry
As a warehouse employee, I want to enter the batch number and expiry date when receiving, so that we can track expiry.

- Both are required for products with batch tracking (C-13).
- An expiry date in the past is rejected (A-17).
- If the batch number already exists for that product, the quantity is added to it.

## Preparing orders

### WH-03 See my tasks
As a warehouse employee, I want a list of orders waiting to be prepared, so that I know what to do next.

- New orders appear automatically. Nobody assigns them to me (A-03).
- The oldest order is at the top.
- I see the customer name and the number of products for each task.

### WH-04 Open a task
As a warehouse employee, I want to open an order and see what to pick, so that I can prepare it.

- I see each product, its quantity, and a recommended batch (C-14).
- Opening the task marks the order as Preparing automatically.
- The customer can no longer cancel the order (A-06).

### WH-05 Choose the batch
As a warehouse employee, I want to accept the recommended batch or choose another, so that the system knows which batch I really picked.

- The recommended batch is the one that expires soonest (C-14).
- I can choose a different batch. The override is recorded in the history.
- I cannot choose an expired batch (A-17).
- A batch close to expiry shows a warning (O-06).
- I can fill one product from two batches.

### WH-06 Scan while picking
As a warehouse employee, I want to scan a product's barcode, so that I pick the right product.

- A correct scan marks the product as picked.
- A wrong scan shows a clear warning.
- I can still pick by tapping if a barcode cannot be scanned.

### WH-07 Prepare less than ordered
As a warehouse employee, I want to record a smaller quantity when I cannot find the full amount, so that the order can still go out.

- I enter the quantity I found and choose a reason (A-08).
- The extra reserved stock is released.
- The customer sees the prepared quantity on their order.

### WH-08 Confirm preparation
As a warehouse employee, I want to confirm that the order is packed, so that it can be delivered.

- I can confirm only when every product has a batch and a quantity.
- One confirmation moves the order to Ready.
- If invoice timing is "on prepared", the invoice is created now (A-05).

## After delivery

### WH-09 Take back goods from a failed delivery
As a warehouse employee, I want to confirm that goods from a failed delivery are back, so that the stock is correct again.

- I see the orders the driver marked as failed.
- When I confirm, on-hand stock increases (A-19).
- The order returns to Ready, or a manager cancels it.

### WH-10 Check returned goods
As a warehouse employee, I want to record the condition of goods a customer returned, so that only good stock is sold again.

- For each product, I confirm the batch and choose sellable or damaged (A-09).
- Sellable goods go back to their batch.
- Damaged goods are recorded but never become available.

## Stock care

### WH-11 Record damaged or lost stock
As a warehouse employee, I want to record stock that is damaged, lost, or expired, so that it is not sold.

- I choose the product, batch, quantity, and reason (C-10).
- On-hand stock decreases.
- I cannot reduce stock below the reserved quantity. I must ask a manager.

### WH-12 See stock close to expiry
As a warehouse employee, I want a list of batches that expire soon, so that we can act before they expire.

- The list shows product, batch, expiry date, and quantity.
- Expired batches are shown separately and cannot be sold (A-17).
