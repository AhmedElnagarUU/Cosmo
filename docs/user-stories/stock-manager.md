# User stories — Stock manager

The stock manager is the person in the middle. They know the stock and see the orders, so they accept or reject each order, receive goods, and prepare orders (C-24, C-34). The screens must need as few taps as possible. Labels such as (C-14) point to [Decisions](../02-decisions.md).

## Receiving

### STK-01 Receive goods from a supplier
As a stock manager, I want to record the goods a supplier delivered, so that the stock is correct.

- I choose the supplier and add each product with its quantity and cost price (C-04).
- I enter the supplier's invoice number and total on the same screen, because the invoice comes with the goods (C-43).
- I can scan a barcode to find the product.
- When I confirm, on-hand stock increases and the amount owed to the supplier increases.
- A new cost price updates the product's cost price. The old price stays in the history (C-75).
- A confirmed receipt cannot be edited (C-09).

### STK-02 Record batch and expiry
As a stock manager, I want to enter the batch number and expiry date when receiving, so that we can track expiry.

- Both are required for products with batch tracking (C-13).
- An expiry date in the past is rejected (C-55).
- If the batch number already exists for that product, the quantity is added to it.

## Accepting orders

### STK-03 See orders waiting for acceptance
As a stock manager, I want a list of new orders, so that I can decide on each one.

- New orders appear automatically, oldest first.
- For each order I see the customer, the products, the quantities, the total, and the payment method.
- I see which products the customer marked "must have" (C-39).
- Orders that arrived while the warehouse was closed are in the same list (C-37).
- I see whether the customer has overdue invoices (C-33).
- The stock for each order is already reserved (C-25).

### STK-04 Accept an order
As a stock manager, I want to accept an order, so that it can be prepared.

- One tap accepts the order (C-24).
- The accepted order moves to my preparation list.
- If invoice timing is "on accepted", the invoice is created now (C-58).

### STK-18 Accept an order with a smaller quantity
As a stock manager, I want to reduce a quantity or remove a product before I accept, so that I do not have to reject a whole order because of one product.

- I can reduce a quantity or remove a product, and I must choose a reason (C-38).
- I can never increase a quantity or add a product.
- The removed quantity is released from reserved stock at once.
- If the changed product is not "must have", the order is accepted and the customer is informed (C-39).
- If the changed product is "must have", the order becomes "Waiting for customer" until the customer accepts or cancels (C-39).
- Bonus units are calculated again for the new quantity (C-41).

### STK-05 Reject an order
As a stock manager, I want to reject an order that has a problem, so that we do not send goods we should not send.

- I must write a reason (C-24).
- The customer sees the reason.
- The reserved stock is released immediately (C-12).
- The owner gets an alert (C-30).

## Preparing orders

### STK-06 See orders to prepare
As a stock manager, I want a list of accepted orders, so that I know what to prepare next.

- The oldest order is at the top.
- I see the customer name and the number of products for each order.

### STK-07 Open an order to prepare
As a stock manager, I want to open an order and see what to pick, so that I can prepare it.

- I see each product, its quantity, and a recommended batch (C-14).
- A product stored in the fridge shows a "keep cold" mark (C-68).
- Opening the order marks it as Preparing automatically.
- While I prepare it, no other stock manager can open it (C-77).
- The customer can no longer cancel the order (C-57).

### STK-08 Choose the batch
As a stock manager, I want to accept the recommended batch or choose another, so that the system knows which batch I really picked.

- The recommended batch is the one that expires soonest (C-14).
- I can choose a different batch. The change is recorded.
- I cannot choose an expired batch (C-55).
- A batch that expires within the near-expiry period shows a warning. The default is six months (C-45).
- I can fill one product from two batches.

### STK-09 Scan while picking
As a stock manager, I want to scan a product's barcode, so that I pick the right product.

- A correct scan marks the product as picked.
- A wrong scan shows a clear warning.
- I can still pick by tapping if a barcode cannot be scanned.

### STK-10 Prepare less than ordered
As a stock manager, I want to record a smaller quantity when I cannot find the full amount, so that the order can still go out.

- I enter the quantity I found and choose a reason (C-38).
- The extra reserved stock is released.
- The customer sees the old quantity, the new quantity, and the reason.
- If the product is "must have", the order becomes "Waiting for customer", and I cannot confirm preparation until the customer accepts (C-39).

### STK-11 Confirm preparation
As a stock manager, I want to confirm that the order is packed, so that it can be delivered.

- I can confirm only when every product has a batch and a quantity.
- One confirmation moves the order to Ready.
- The delivery manager now sees the order (C-28).
- If invoice timing is "on prepared", the invoice is created now (C-58).

## After delivery

### STK-12 Take back goods from a failed delivery
As a stock manager, I want to confirm that goods from a failed delivery are back, so that the stock is correct again.

- I see the orders the delivery person marked as failed.
- When I confirm, on-hand stock increases (C-61).
- The order returns to Ready for a new trip, or it is cancelled.

### STK-13 Check returned goods
As a stock manager, I want to record the condition of goods a customer returned, so that only good stock is sold again.

- This covers normal returns and items refused at the door (C-47).
- For each product, I confirm the batch and choose sellable or damaged (C-60).
- Sellable goods go back to their batch.
- Damaged goods are recorded but never become available.

## Stock care

### STK-14 Correct stock after a count
As a stock manager, I want to correct a stock quantity after a physical count, so that the system matches the shelf.

- I must enter a reason (C-10).
- The correction is saved as a stock movement. The old number is not overwritten (C-09).
- I cannot reduce stock below the reserved quantity.
- The owner gets an alert with my name and the reason (C-30).

### STK-15 Record damaged or lost stock
As a stock manager, I want to record stock that is damaged, lost, or expired, so that it is not sold.

- I choose the product, batch, quantity, and reason (C-10).
- On-hand stock decreases.
- The owner gets an alert (C-30).

### STK-16 See stock close to expiry
As a stock manager, I want a list of batches that expire soon, so that we can act before they expire.

- The list shows product, batch, expiry date, and quantity.
- Expired batches are shown separately and cannot be sold (C-55).

### STK-19 Return goods to a supplier
As a stock manager, I want to record goods we send back to a supplier, so that the stock and the amount we owe are correct.

- I choose the supplier, then the product, batch, and quantity (C-42).
- I must choose a reason: expired, close to expiry, damaged, wrong product, or other.
- I cannot return more than the on-hand quantity of the batch that is not reserved.
- When I confirm, on-hand stock decreases and the amount owed to the supplier decreases.
- If the owner has switched on approval, my return waits for the owner first. If the owner rejects it, I see the reason and nothing changes (C-65).
- A confirmed supplier return cannot be edited (C-09).

### STK-17 Cancel an order
As a stock manager, I want to cancel an accepted order when a customer asks or a problem appears, so that the stock is free again.

- I can cancel until the trip starts, and I must give a reason (C-57).
- The reserved stock is released (C-12).
- The customer gets a notification with the reason (C-46).
- The owner gets an alert (C-30).
