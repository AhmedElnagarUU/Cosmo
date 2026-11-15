# User stories

A user story describes one thing a person needs to do, in their own words:

> As a **role**, I want to **do something**, so that **I get a benefit**.

Under each story are **acceptance checks**. A story is finished only when every check passes.

## Files

| File | Role | Prefix |
|---|---|---|
| [customer.md](customer.md) | Pharmacy or store | CUS |
| [owner-and-manager.md](owner-and-manager.md) | Owner and manager | MGR |
| [sales.md](sales.md) | Sales employee | SAL |
| [warehouse.md](warehouse.md) | Warehouse employee | WH |
| [accountant.md](accountant.md) | Accountant | ACC |
| [driver.md](driver.md) | Delivery driver | DRV |

## Who can do what — first proposal (O-07)

This table is a proposal. It needs review before it is final.

| Area | Owner | Manager | Sales | Warehouse | Accountant | Driver | Customer |
|---|---|---|---|---|---|---|---|
| Settings and employees | Yes | View | | | | | |
| Customers | Yes | Yes | Yes | | View | | Own profile |
| Products and prices | Yes | Yes | View | View | View | | View catalog |
| Stock and batches | Yes | Yes | View | Yes | View | | In stock or not |
| Stock adjustments | Yes | Yes | | Request | | | |
| Suppliers and receiving | Yes | Yes | | Yes | Yes | | |
| Orders | Yes | Yes | Create and view | View | View | | Own orders |
| Preparation tasks | Yes | Yes | | Yes | | | |
| Delivery trips | Yes | Yes | | Create | | Own trips | |
| Invoices and payments | Yes | View | View | | Yes | Record cash | Own invoices |
| Returns | Yes | Yes | Create | Check goods | Yes | | View own |
| Reports and activity history | Yes | Yes | | | Financial | | |

## Story map

The top row is the journey. The stories under each step are what make that step possible.

```mermaid
flowchart LR
    S1[Set up the business] --> S2[Stock the warehouse]
    S2 --> S3[Take orders]
    S3 --> S4[Prepare orders]
    S4 --> S5[Deliver]
    S5 --> S6[Get paid]
    S6 --> S7[Handle returns]
    S7 --> S8[Watch the business]

    S1 --- T1[MGR-01 to MGR-04<br/>SAL-01<br/>CUS-01, CUS-02]
    S2 --- T2[MGR-05 to MGR-07<br/>WH-01, WH-02, WH-11, WH-12<br/>ACC-06, ACC-07]
    S3 --- T3[CUS-03 to CUS-09<br/>SAL-02 to SAL-04<br/>MGR-08]
    S4 --- T4[WH-03 to WH-08]
    S5 --- T5[MGR-09<br/>DRV-01 to DRV-08<br/>WH-09]
    S6 --- T6[ACC-01 to ACC-05<br/>ACC-08, ACC-10<br/>CUS-10, CUS-11]
    S7 --- T7[SAL-05, WH-10<br/>ACC-09, CUS-12]
    S8 --- T8[MGR-10 to MGR-12]
```
