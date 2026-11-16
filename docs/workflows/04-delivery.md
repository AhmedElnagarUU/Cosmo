# Delivery

The delivery manager assigns ready orders to delivery people, so there is always one named person responsible for each order (C-28).

## Trip statuses

```mermaid
stateDiagram-v2
    [*] --> Planned: Delivery manager creates the trip and assigns a delivery person
    Planned --> InProgress: Delivery person starts the trip
    InProgress --> Finished: Every stop has a result
    Finished --> Closed: Every payment is checked and every signed paper is received
    Planned --> [*]: Delivery manager deletes the trip
    Closed --> [*]
```

## Stop results

Each stop is one customer's order inside the trip.

```mermaid
stateDiagram-v2
    [*] --> Assigned
    Assigned --> OutForDelivery: Trip starts
    OutForDelivery --> Delivered: Customer received the order and signed the paper
    OutForDelivery --> Failed: Not delivered, reason recorded
    Delivered --> [*]
    Failed --> [*]
```

If the customer refuses some items, the stop is still Delivered. The refused items are recorded as a return with a reason (C-47). If the customer refuses everything, the stop is Failed.

## Proof of delivery (C-44)

```mermaid
flowchart LR
    A[Customer signs<br/>the delivery paper] --> B[Delivery person marks<br/>the stop as delivered]
    B --> C[Delivery person brings<br/>the paper back]
    C --> D{Delivery manager<br/>has the paper?}
    D -- Yes --> E[Marks signed paper received]
    D -- No --> F[Order stays on the missing papers list<br/>Owner gets an alert]
```

The paper is not photographed or uploaded. The wholesaler keeps it in their own way. The app only records that the delivery manager received it.

## Planning a trip

```mermaid
flowchart TD
    A[Stock manager confirms preparation] --> B[Order appears in the delivery manager's ready list]
    B --> C[Delivery manager selects orders for one trip]
    C --> D[Delivery manager chooses the delivery person]
    D --> E[Delivery manager arranges the stops in order]
    E --> F[Trip is Planned and appears on the delivery person's phone]
```

## The delivery day

```mermaid
sequenceDiagram
    actor M as Delivery manager
    actor D as Delivery person
    participant S as System
    actor C as Customer
    actor K as Stock manager
    actor A as Accountant

    M->>S: Create trip and assign delivery person
    D->>S: Open today's trip
    D->>S: Start trip
    S->>S: Decrease on-hand and reserved stock for all orders in the trip
    loop For each stop
        D->>C: Hand over the goods
        alt Delivered
            C->>D: Signs the delivery paper
            D->>S: Mark delivered
            opt Customer refuses some items
                D->>S: Record refused items and a reason
                S->>S: Create a return for the refused items
            end
            opt Customer pays now
                C->>D: Pays by cash, InstaPay, or Vodafone Cash
                D->>S: Record method, amount, and reference
                S->>S: Save payment as waiting for confirmation
            end
        else Failed
            D->>S: Mark failed and choose a reason
            S-->>M: Failed delivery appears
        end
    end
    D->>K: Bring back goods from failed stops and refused items
    K->>S: Confirm the goods are back and their condition
    D->>M: Hand over the signed papers
    M->>S: Mark signed paper received for each order
    D->>A: Hand over cash
    A->>S: Confirm or reject each payment
    S->>S: Close the trip
```

## Rules

| Rule | Decision |
|---|---|
| Only Ready orders can be added to a trip | |
| An order can be in only one active trip | |
| Every trip has exactly one delivery person | C-28 |
| Stock leaves the warehouse when the trip starts | C-25 |
| A failed stop needs a reason: customer not available, address problem, customer refused, other | C-21 |
| Goods from a failed stop go back to stock only after the stock manager confirms they are back | A-19 |
| After a failed stop, the order returns to Ready for another trip, or it is cancelled | A-19 |
| The delivery person sees only their own trips | A-23 |
| A payment recorded by the delivery person waits for the accountant. It does not count as paid yet | C-27 |
| A credit order has nothing to collect at the door | C-26 |
| Items refused at the door become a return with a reason. The customer pays only for what they kept | C-47 |
| A delivered order needs a signed paper. The delivery manager confirms it arrived | C-44 |
| A trip closes only when every payment is checked and every signed paper is received | C-27, C-44 |
| No GPS, no live tracking, no automatic route | |

## Still to decide

- Can a delivery person change the order of stops during the trip?
