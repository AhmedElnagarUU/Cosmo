# User stories

A user story describes one thing a person needs to do, in their own words:

> As a **role**, I want to **do something**, so that **I get a benefit**.

Under each story are **acceptance checks**. A story is finished only when every check passes.

## Files

| File | Role | Prefix |
|---|---|---|
| [customer.md](customer.md) | Pharmacy or store | CUS |
| [owner.md](owner.md) | Owner of the wholesale business | OWN |
| [sales.md](sales.md) | Sales employee | SAL |
| [stock-manager.md](stock-manager.md) | Stock manager | STK |
| [delivery-manager.md](delivery-manager.md) | Delivery manager | DM |
| [delivery.md](delivery.md) | Delivery person | DEL |
| [accountant.md](accountant.md) | Accountant | ACC |

## Who can do what (A-23)

The owner can do everything. Every other role sees only what its job needs. One employee can hold more than one role (C-31).

| Area | Owner | Sales | Stock manager | Delivery manager | Accountant | Delivery | Customer |
|---|---|---|---|---|---|---|---|
| Employees and settings | Yes | | | | | | |
| Customers | Yes | Add and view | | View address and phone | View | | Own profile |
| Credit switch and credit period | Yes | | | | View | | |
| Products and prices | Yes | View | Products yes, prices view | | View | | View catalog |
| Stock and batches | Yes | View available | Yes | | | | In stock or not |
| Suppliers and receiving | Yes | | Yes | | View | | |
| Accept or reject orders | Yes | | Yes | | | | |
| Orders | Yes | Create and view | View and cancel | View ready orders | View | | Own orders |
| Order preparation | Yes | | Yes | | | | |
| Delivery trips | Yes | | | Yes | View | Own trips | |
| Record payment at delivery | Yes | | | | | Yes | |
| Confirm payments, invoices, balances | Yes | View | | | Yes | | Own invoices |
| Supplier payments | Yes | | | | Yes | | |
| Returns | Yes | Start | Check goods | | Credit | | View own |
| Activity screen and alerts | Yes | | | | | | |
| Reports | Yes | | Stock reports | | Money reports | | |

## Story map

The top row is the journey. The stories under each step are what make that step possible.

```mermaid
flowchart LR
    S1[Set up the business] --> S2[Stock the warehouse]
    S2 --> S3[Take and accept orders]
    S3 --> S4[Prepare orders]
    S4 --> S5[Deliver]
    S5 --> S6[Get paid]
    S6 --> S7[Handle returns]
    S7 --> S8[Watch the business]

    S1 --- T1[OWN-01 to OWN-05<br/>SAL-01<br/>CUS-01, CUS-02]
    S2 --- T2[OWN-06, OWN-07<br/>STK-01, STK-02<br/>STK-14 to STK-16<br/>ACC-09, ACC-10]
    S3 --- T3[CUS-03 to CUS-10<br/>SAL-02 to SAL-04<br/>STK-03 to STK-05, STK-17<br/>OWN-08]
    S4 --- T4[STK-06 to STK-11]
    S5 --- T5[DM-01 to DM-05<br/>DEL-01 to DEL-08<br/>STK-12]
    S6 --- T6[ACC-01 to ACC-08, ACC-12<br/>CUS-11, CUS-12]
    S7 --- T7[SAL-05, STK-13<br/>ACC-11, CUS-13]
    S8 --- T8[OWN-09 to OWN-12]
```
