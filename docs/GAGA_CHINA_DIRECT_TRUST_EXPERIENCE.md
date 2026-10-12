# GaGa China Direct — trust-first shopping experience

## Positioning
"Shop in China. Delivered to Bangladesh." GaGa is a Bangladesh-facing China sourcing and cross-border commerce service. Never imply official Pinduoduo partnership or China incorporation unless verified.

## UI journeys
Today -> China Direct tile -> China Marketplace -> Category/Search -> Product detail -> Landed-cost quote -> Cart -> Checkout -> Supplier purchase -> China warehouse -> Cargo -> Bangladesh customs -> Last mile -> Delivery confirmation.

## Product detail trust elements
- Supplier identity and verification level with last verification date.
- Original China listing/source URL only if licensed/allowed, and product imagery rights.
- CNY source price, timestamp and source; FX rate/time; BDT landed estimate with itemized shipping, handling, duty/tax, fees and margin.
- Product options, size/color, inventory verification state, estimated delivery range with uncertainty.
- Explicit buyer protection, cancellation/refund conditions, dispute channel.
- Clear "GaGa sources on your behalf" label; do not claim direct Pinduoduo checkout when procurement is manual.

## Tracking state machine
ORDER_PLACED -> PAYMENT_CONFIRMED -> PROCUREMENT_PENDING -> PURCHASED_IN_CHINA -> CHINA_WAREHOUSE_RECEIVED -> QC_COMPLETE -> EXPORTED -> ARRIVED_BANGLADESH -> CUSTOMS_CLEARANCE -> LOCAL_COURIER -> DELIVERED.
Exception states: OUT_OF_STOCK, PRICE_CHANGED_AWAITING_APPROVAL, QC_FAILED, CUSTOMS_HOLD, LOST, REFUND_PENDING, REFUNDED.
Every transition: actor, timestamp, evidence reference, customer-visible explanation. Never fake updates or ETAs.

## Buyer trust UX
Bangla primary, English optional; accurate China location names; receipt and invoice; support escalation; proof of warehouse receipt where lawful; no fabricated ratings or urgency countdowns. Display real reviews only, with verified purchase status.
Group buying is optional and must state minimum participants, closing time and failure/refund policy.

## Backend/operations
Supplier offer snapshots, price quote expiry, FX quote, order ledger, warehouse receiving scans, parcel consolidation, shipping manifests, customs documentation, last-mile courier events, returns/refunds and immutable audit logs.
Server calculates payable amount; price increases require explicit buyer re-approval.
Cross-border import restrictions, customs classification, consumer protection and payment compliance require review before live launch.

## Existing GaGa design
Keep Today dark navy background and bright green accents; Shop uses bright white surfaces with existing emerald/green primary buttons; bottom navigation remains Chats, People, Calls, Today, Me. China Direct is an embedded Today feature, not a replacement for chat.
