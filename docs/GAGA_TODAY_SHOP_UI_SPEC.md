# GaGa Today + China Shop — UI implementation specification

Status: design/development branch; no production deployment.

## Preserve existing navigation
Chats | People | Calls | Today | Me. Do not replace existing messaging or profile flows.

## Theme
Existing GaGa dark Today surface: #09141B; header #101C23; emerald primary #008D76; bright green indicator #46D85B; light card #F5F6F8; neutral text #EAF0F3. Provide dark/light variants, WCAG contrast, and large touch targets.

## Today layout
1. Greeting and date; concise daily summary.
2. Today at a glance: tasks, events, reminders, unread (live counts).
3. Quick actions: task, event, reminder, expense, income, note; retain existing routes.
4. China Shop preview: search, top categories, limited curated deals, group-buy CTA; price includes separate landed-cost estimate.
5. Needs reply and missed calls; existing behavior unchanged.
6. Money summary, pending orders, delivery tracking; permission-gated.

## Shop flow
Shop Home -> Search/Category -> Product -> Cart -> Checkout -> Order -> China Warehouse -> Cargo -> Customs -> Bangladesh Delivery -> Delivered.
Category taxonomy: fashion, electronics, phones, computers, home, kitchen, beauty, toys, sports, automotive, industrial, tools, stationery, pet, baby, accessories.
Product: supplier provenance, SKU, variants, verified price in CNY, estimated BDT total, quantity, lead time, import restrictions, review provenance.
Cart: item subtotal, China domestic shipping, warehouse handling, international freight, estimated duty/VAT, last-mile delivery, FX rate and buffer. Never promise same China domestic price as Bangladesh landed price.
Checkout: shipping address, identity where required, payment confirmation, stock verification, refund and cancellation terms.
Group buying: threshold, expiry, reservation state, automatic cancellation/refund policy if threshold not met.

## Backend contracts (proposed)
products, variants, suppliers, supplier_offers, price_snapshots, inventory, carts, cart_items, orders, order_items, procurement_orders, warehouses, warehouse_receipts, cargo_shipments, customs_entries, local_deliveries, group_buys, group_members, payments, refunds, audit_logs.
Use idempotency keys for order/payment creation; server-authoritative totals; RBAC and RLS; signed media uploads; webhook signature validation.
Do not scrape protected Pinduoduo data or copy product imagery without rights. Use licensed supplier feeds or manually sourced listings.

## Rollout
1. Inspect native UI framework, Today navigation and design tokens.
2. Implement Today Shop entry and static product catalog behind feature flag.
3. Add API-backed catalog and search.
4. Add cart and quote with landed cost.
5. Add verified checkout, procurement, warehouse and shipping tracking.
6. Security, performance, accessibility, Android device QA and staged release.

## Acceptance
Existing Today shortcuts and chat unread counts work unchanged. Shop routes back correctly. Product price source and quote timestamp visible. Cart survives app restart. No wallet FX or cross-border remittance without licensed provider and regulatory review.
