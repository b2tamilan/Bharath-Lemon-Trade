# 🍋 Lemon Trading V2.2

Real-use, mobile-first local-first web app for a lemon trading business.

## V2 modules
- Dashboard
- Sales / Bills
- Purchase
- Parties + individual ledger
- Stock
- Payments / Receipts
- Expenses
- Wastage
- Stock adjustments
- Date-range reports
- Customer receivable / supplier payable
- Gross profit + net profit estimate
- CSV transaction export
- CSV outstanding export
- JSON backup / restore
- Printable bill / Save as PDF from browser
- Web Share / WhatsApp fallback
- IndexedDB storage
- PWA manifest + service worker
- V1 localStorage migration when V2 is opened on the same origin and the old V1 data exists

## Important V2 accounting behavior
### Stock
Current stock = Opening + Purchases - Sales - Wastage + Adjustments.

### Gross profit
V2 uses a simple weighted-average purchase cost:
`Average Cost/kg = Total Purchase Value / Total Purchased kg`
`Gross Profit = Sales Value - (Sales kg × Average Cost/kg)`

This is intentionally simple for V2. It is not batch/FIFO valuation.

### Party balances
Customer balance = Opening + Sales - Customer Receipts.
Supplier balance = Opening + Purchases - Supplier Payments.

## Run locally
From this folder:

```bash
python -m http.server 8000
```

Open:
`http://localhost:8000`

For full PWA installation/service-worker behavior, use HTTPS when hosted.

## Production note
This is a functional local-first V2 application. Data is stored in the browser's IndexedDB. It does not yet have multi-device cloud synchronization or authenticated server backup. Those belong in V3/cloud deployment.


## V2.1 Ledger Statement
- Tap any Customer/Supplier in Parties, or tap the `Statement` button.
- Select From/To date.
- Statement includes Opening Balance, Date, Ref, Description, Debit, Credit and Running Balance.
- Print or choose **Save as PDF** from the browser print dialog.
- Share statement summary through the device share sheet / WhatsApp fallback.

## V2.2 Edit / Delete
- Sales invoices can be edited or deleted from the Sales list or invoice preview.
- Purchase entries can be edited or deleted from the Purchase list.
- Edit keeps the original invoice / purchase number.
- Amount received/paid that was auto-created with the transaction is updated or removed when the source transaction is edited/deleted. Manual ledger payments remain separate.
- Purchase and Sale edit/delete actions include stock-safety checks so the resulting stock does not go negative.

## V2.3 Restore Fix
- Fixes the V2 backup restore `Symbol.iterator` error caused by treating the single settings object as an array.
- Accepts both corrected V2 backups (settings array) and older V2 backups where settings was exported as one object.
- Recreates the `main` settings row when missing.
- Rebuilds missing invoice/purchase counters from restored transaction numbers.
- Backup now exports every settings row.
