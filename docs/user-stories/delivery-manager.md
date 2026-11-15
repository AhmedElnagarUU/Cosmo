# User stories — Delivery manager

The delivery manager assigns ready orders to delivery people and always knows who has which order (C-28). Labels such as (C-20) point to [Decisions](../02-decisions.md).

### DM-01 See orders ready for delivery
As a delivery manager, I want a list of orders that are packed and ready, so that I can plan deliveries.

- An order appears as soon as the stock manager confirms preparation.
- For each order I see the customer, the address, the phone, and the amount to collect.
- I see how long each order has been waiting.

### DM-02 Create a trip and assign a delivery person
As a delivery manager, I want to group orders into a trip and assign it to a delivery person, so that each order has one person responsible for it.

- I select one or more ready orders and choose a delivery person (C-20).
- I arrange the stops in the order they should be visited.
- An order cannot be in two active trips.
- The trip appears on the delivery person's phone.

### DM-03 Change a trip before it starts
As a delivery manager, I want to change a trip that has not started, so that I can react to changes.

- I can add or remove orders, change the stop order, or change the delivery person.
- I cannot change a trip after the delivery person has started it.

### DM-04 Follow deliveries
As a delivery manager, I want to see every trip and its progress, so that I always know who has which order.

- I see each trip with its delivery person and its status.
- For each stop I see the result: waiting, delivered, partially delivered, or failed.
- I can search for an order and see which delivery person has it.
- There is no map or live location.

### DM-05 Handle a failed delivery
As a delivery manager, I want to plan a new delivery for an order that failed, so that the customer still receives the goods.

- I see failed orders with the reason the delivery person chose (C-21).
- After the stock manager confirms the goods are back, the order is Ready again and I can add it to a new trip (A-19).
- If the order should not be delivered again, the owner or stock manager cancels it.
