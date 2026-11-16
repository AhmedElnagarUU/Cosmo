# User stories — Delivery

The delivery person uses a phone, often with a weak connection. Every screen must be simple, with large buttons. Labels such as (C-27) point to [Decisions](../02-decisions.md).

### DEL-01 See my trips
As a delivery person, I want to see the trips assigned to me, so that I know my work for the day.

- I see only my own trips.
- Each trip shows the number of stops.

### DEL-02 Start a trip
As a delivery person, I want to start my trip when I leave the warehouse, so that everyone knows the orders are on the way.

- One tap starts the trip.
- All orders in the trip become Out for delivery.
- Stock leaves the warehouse in the system at this moment (C-25).

### DEL-03 See each stop
As a delivery person, I want to see the details of each stop, so that I can find the customer and hand over the right goods.

- I see the stops in the order the delivery manager arranged (C-20).
- Each stop shows customer name, address, phone, products, quantities, the payment method, and the amount to collect.
- A credit order shows "no payment to collect".
- An order with fridge products shows a "keep cold" mark (C-68).
- I can tap the phone number to call the customer.

### DEL-04 Mark a stop as delivered
As a delivery person, I want to mark an order as delivered, so that the office knows it arrived.

- One tap marks the stop as Delivered.
- If invoice timing is "on delivered", the invoice is created now (C-58).
- Tapping twice does not record the delivery twice.
- The customer signs the delivery paper, and I keep it to hand to the delivery manager. I do not upload a photo (C-44).

### DEL-05 Record the payment I collected
As a delivery person, I want to record what the customer paid me, so that the accountant can confirm it.

- I choose the method the customer used: cash, InstaPay, or Vodafone Cash (C-26).
- I enter the amount. For InstaPay and Vodafone Cash, I also enter the reference number.
- The payment is saved as "waiting for confirmation". It does not count as paid until the accountant confirms it (C-27).
- The amount can be less than the invoice total. The rest stays unpaid.
- I see the total cash I am carrying for the trip.

### DEL-06 Report a failed delivery
As a delivery person, I want to report that I could not deliver, so that the office can decide what to do.

- I must choose a reason: customer not available, address problem, customer refused, or other (C-21).
- The goods stay with me until I return them to the warehouse (C-61).

### DEL-07 Record items refused at the door
As a delivery person, I want to record the items the customer refused, so that they pay only for what they kept.

- I enter the refused quantity for each product and choose a reason (C-47).
- The system creates a return for these items. The stop is still Delivered.
- The amount to collect is updated at once.
- The refused items come back to the warehouse with me.
- If the customer refuses everything, I report a failed delivery instead (DEL-06).

### DEL-08 Finish the trip
As a delivery person, I want to see when my trip is complete, so that I know what to bring back.

- The trip is finished when every stop has a result.
- I see a summary: delivered stops, failed stops, goods to return, cash to hand over, and signed papers to hand over (C-44).
