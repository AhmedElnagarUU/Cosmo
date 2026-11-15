# Delivery

## Trip statuses

```mermaid
stateDiagram-v2
    [*] --> Planned: Manager creates the trip and assigns a driver
    Planned --> InProgress: Driver starts the trip
    InProgress --> Finished: Every stop has a result
    Finished --> Closed: Accountant confirms cash handover
    Planned --> [*]: Manager deletes the trip
    Closed --> [*]
```

## Stop results

Each stop is one customer's order inside the trip.

```mermaid
stateDiagram-v2
    [*] --> Assigned
    Assigned --> OutForDelivery: Trip starts
    OutForDelivery --> Delivered: Customer received everything
    OutForDelivery --> PartiallyDelivered: Customer accepted some items
    OutForDelivery --> Failed: Not delivered, reason recorded
    Delivered --> [*]
    PartiallyDelivered --> [*]
    Failed --> [*]
```

## Planning a trip (A-21)

```mermaid
flowchart TD
    A[Manager opens the list of Ready orders] --> B[Manager selects orders for one trip]
    B --> C[Manager assigns a driver]
    C --> D[Manager arranges the stops in order]
    D --> E[Trip is Planned and appears on the driver's phone]
```

## The driver's day

```mermaid
sequenceDiagram
    actor D as Driver
    participant S as System
    actor C as Customer
    actor W as Warehouse
    actor A as Accountant

    D->>S: Open today's trip
    D->>S: Start trip
    S->>S: Decrease on-hand and reserved stock for all orders in the trip
    loop For each stop
        D->>C: Hand over the goods
        alt Delivered
            D->>S: Mark delivered
            opt Cash on delivery
                D->>S: Record cash collected
            end
        else Failed
            D->>S: Mark failed and choose a reason
        end
    end
    D->>W: Bring back goods from failed stops
    W->>S: Confirm returned goods are back
    D->>A: Hand over cash
    A->>S: Confirm cash received and close the trip
```

## Rules

| Rule | Decision |
|---|---|
| Only Ready orders can be added to a trip | |
| An order can be in only one active trip | |
| Stock leaves the warehouse when the trip starts | A-04 |
| A failed stop needs a reason: customer not available, address problem, customer refused, other | C-21 |
| Goods from a failed stop go back to stock only after the warehouse confirms they are back | A-19 |
| After a failed stop, the order returns to Ready for another trip, or a manager cancels it | A-19 |
| The driver sees only their own trips | |
| The driver records cash collected. The accountant confirms the handover | A-16 |
| No GPS, no live tracking, no automatic route | |

## Still open

- **O-04** — Does the driver capture a signature or a photo as proof of delivery?
- **O-10** — When a customer refuses some items at the door, is it recorded as a partial delivery or as a return?
