# User stories — Driver

The driver uses a phone, often with a weak connection. Every screen must be simple, with large buttons. Labels such as (A-16) point to [Decisions](../02-decisions.md).

### DRV-01 See my trips
As a driver, I want to see the trips assigned to me, so that I know my work for the day.

- I see only my own trips.
- Each trip shows the number of stops.

### DRV-02 Start a trip
As a driver, I want to start my trip when I leave the warehouse, so that everyone knows the orders are on the way.

- One tap starts the trip.
- All orders in the trip become Out for delivery.
- Stock leaves the warehouse in the system at this moment (A-04).

### DRV-03 See each stop
As a driver, I want to see the details of each stop, so that I can find the customer and hand over the right goods.

- I see the stops in the order the manager arranged (C-20).
- Each stop shows customer name, address, phone, products, quantities, and the amount to collect.
- I can tap the phone number to call the customer.

### DRV-04 Mark a stop as delivered
As a driver, I want to mark an order as delivered, so that the office knows it arrived.

- One tap marks the stop as Delivered.
- If invoice timing is "on delivered", the invoice is created now (A-05).
- Tapping twice does not record the delivery twice.
- Proof of delivery, such as a signature or photo, is still open (O-04).

### DRV-05 Record cash collected
As a driver, I want to record the cash a customer gave me, so that it is counted correctly.

- For cash-on-delivery orders, I enter the amount I received (A-16).
- The amount can be less than the invoice total. The rest stays unpaid.
- I see the total cash I am carrying for the trip.

### DRV-06 Report a failed delivery
As a driver, I want to report that I could not deliver, so that the office can decide what to do.

- I must choose a reason: customer not available, address problem, customer refused, or other (C-21).
- The goods stay with me until I return them to the warehouse (A-19).

### DRV-07 Report a partial delivery
As a driver, I want to record that the customer accepted only some items, so that they are charged only for what they took.

- I enter the quantity accepted for each product.
- The refused items come back to the warehouse with me.
- The exact handling is still open (O-10).

### DRV-08 Finish the trip
As a driver, I want to see when my trip is complete, so that I know what to bring back.

- The trip is finished when every stop has a result.
- I see a summary: delivered stops, failed stops, goods to return, and cash to hand over.
