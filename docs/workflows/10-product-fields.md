# Product fields

This is the list of fields a product has (C-66). The owner chooses the product type first, and the form shows only the fields for that type.

```mermaid
flowchart TD
    A[Owner or stock manager creates a product] --> B[Fills the fields for every product]
    B --> C{Product type?}
    C -- Medicine --> D[Fills the medicine fields]
    C -- Cosmetic --> E[Fills the cosmetic fields]
    D --> F[Product is saved with zero stock]
    E --> F
```

## Fields for every product

| Field | Required | Shown to customers | Note |
|---|---|---|---|
| Name in Arabic | Yes | Yes | |
| Name in English | Yes | Yes | |
| Product type | Yes | Yes | Medicine or cosmetic |
| Barcode | No | No | Some local products have none |
| Brand or manufacturer | Yes | Yes | |
| Category | Yes | Yes | For example "pain relief" or "hair care" |
| Selling unit | Yes | Yes | For example "box" (C-50) |
| Pack size | Yes | Yes | As written on the pack, for example "20 tablets" or "200 ml" |
| Cost price | Yes | No | Only the owner and accountant see it |
| Selling price | Yes | Yes | Only the owner can change it (C-64) |
| Image | No | Yes | |
| Description | No | Yes | |
| Batch and expiry tracking | Yes | No | On or off (C-13) |
| Active | Yes | No | Inactive products are hidden from customers |

## Extra fields for medicines

| Field | Required | Shown to customers | Note |
|---|---|---|---|
| Active ingredient | Yes | Yes | The scientific name. Customers can search by it |
| Strength | Yes | Yes | For example "500 mg" |
| Dosage form | Yes | Yes | Tablet, capsule, syrup, injection, cream, drops, and so on |
| Storage | Yes | Yes | Room temperature, or fridge (2 to 8 °C) |
| Public price | No | Yes | The price printed on the pack, shown next to the selling price |
| Registration number | No | No | The Egyptian Drug Authority number |
| Needs a prescription | No | Yes | Yes or no |

## Extra fields for cosmetics

| Field | Required | Shown to customers | Note |
|---|---|---|---|
| Shade or colour | No | Yes | Name and number, for makeup and hair dye |
| Suitable for | No | Yes | Skin type or hair type |
| Period after opening | No | Yes | For example "12 months" |

## Rules

| Rule | Decision |
|---|---|
| Each shade or size is its own product, with its own barcode, price, and stock | C-67 |
| A product with storage "fridge" shows a "keep cold" mark on preparation and delivery screens | C-68 |
| Controlled medicines that need special records are not in the first version | C-70 |
| Categories, brands, and dosage forms are chosen from lists, so the catalog stays clean and searchable | |

## Still to decide

- Is the public price always printed on medicine packs in Egypt? If not, the field stays optional and is simply left empty.
- Who keeps the lists of categories and brands: only the owner, or the stock manager too?
