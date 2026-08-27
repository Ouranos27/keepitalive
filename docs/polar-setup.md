# Polar setup

Every text this project needs typed into Polar, ready to paste, plus the two
settings that will silently break the game if they are wrong.

Polar moves its dashboard labels around; the headings below say what is being
asked rather than quoting a label exactly. Where a label is uncertain the API
field name is given in `code`, because that is what the form writes to and it
does not move.

Nothing here is optional flavour. The account review is done by a person, and
"a countdown that dies unless strangers pay" reads as fraud if it is described
badly. It is a novelty entertainment product with an instant digital delivery,
and every answer below says so plainly.

---

## 1. Organization

| Field | Value |
| --- | --- |
| Name (`name`) | `Last Light` |
| Slug (`slug`) | `lastlight` |
| Website (`website`) | `https://lastlight.lol` |
| Support email (`email`) | a monitored address you actually read |
| Socials (`socials`) | whatever exists; the account review reads them |

The slug is not cosmetic: it appears on the customer's **credit card
statement**, on the checkout page and in the customer portal. A payer who
cannot recognise the line on their statement files a chargeback, and a
chargeback on a $3 novelty payment costs more than the payment. `lastlight`
matches the domain, the page title and the button they clicked.

The support email is the same argument. A dispute usually starts as an email
that never got answered.

---

## 2. Account review

Polar is the merchant of record, so it underwrites the fraud risk and asks
what it is underwriting before it lets money through. Answer in plain terms;
the failure mode here is sounding evasive, not sounding small.

**What you sell** (`product_description`) — the important one:

> lastlight.lol is a single web page holding a 24-hour countdown. When it
> reaches zero the page freezes permanently and cannot be revived.
>
> A payment does two things at once, both delivered instantly and
> automatically by webhook: it adds time to the public countdown, and it adds
> a permanent line to the public ledger with the payer's chosen display name
> and link. Paying more than the current holder also takes the single
> highlighted position at the top of the page, which is held until somebody
> pays more.
>
> How much time a payment buys depends on how close to zero the clock is:
> time is cheap near death and expensive at the start, capped at two hours per
> payment. The minimum payment is $3 and prices are set per checkout, so the
> amount shown on the site is the amount charged.
>
> There is no account, no login and no subscription. Nothing is billed twice.

**Categories** (`selling_categories`) — pick the nearest available; this is
entertainment / novelty digital content, not SaaS, not a service.

**Pricing models** (`pricing_models`) — one-time payments only.

**Switching from another platform** (`switching`, `switching_from`) — no,
unless you actually are.

**About you and your business** (`about`) and **how you will use Polar**
(`intended_use`) are older fields that may still appear:

> An independent one-person project. Polar handles hosted checkout and is the
> merchant of record; the site itself stores no card data, has no accounts,
> and only ever reacts to a signed `order.*` webhook. One product, one-time
> payments, priced per checkout.

**Expected revenue in the next 12 months** (`future_annual_revenue`) — if it
appears, give a real low number. This is a one-day event, and inflating it
invites scrutiny that a novelty page does not need.

You will also be asked for **identity verification** (passport / ID / driving
licence plus a selfie, through Stripe Identity) and a **payout account**
(Stripe Connect Express). Neither has any text to prepare.

Review goes faster when the site is already live and the integration is
finished, so deploy before submitting. If Polar asks you to demonstrate the
purchase flow, the honest demonstration is a sandbox recording: a $3 payment,
the ledger line appearing, the clock moving.

---

## 3. The product

One product, one time. Everything the site sells goes through it, because the
price is set per checkout rather than in the catalogue.

| Field | Value |
| --- | --- |
| Name (`name`) | `Time on the clock` |
| Billing | **One-time purchase** — never recurring |
| Pricing model | **Fixed price** |
| Price | **$3.00** |
| Media | optional; a screenshot of the clock is enough |
| Checkout fields | **none** |
| Benefits | **none** |

Name limits are 3 to 64 characters, and it is what appears on the checkout
page and the receipt. `Time on the clock` reads correctly on a receipt read
back three days later; `Crown` does not.

**Description** (Markdown, shown at checkout):

> Adds time to the countdown at lastlight.lol and puts your name and link
> permanently in the public ledger.
>
> How much time you buy depends on how close the clock is to zero — time is
> cheapest right before death, capped at two hours per payment. Paying more
> than the current holder also takes the single highlighted position at the
> top of the page for as long as nobody outbids you.
>
> Delivered instantly, once your payment is confirmed. No account, no
> subscription, nothing recurring.
>
> The ledger outlives the clock: when the site dies, the page freezes with
> every entry still on it.

### Why fixed $3, when the price is always overridden

Each checkout carries an ad-hoc price for exactly the bid being made, which
overrides the catalogue. The catalogue price is therefore only ever a
**fallback** — what a payer would be charged if the override failed to apply.

So it is set to the site's own floor, $3. A fallback that undercharges leaves
the ledger honest, because the webhook credits what was actually paid. A
fallback of, say, $50 would charge a $3 payer $50 and produce a refund and a
complaint.

For the same reason the model must be **fixed**, not pay-what-you-want. A
custom price puts an editable amount box on the checkout page, and the whole
mechanic depends on the amount being the one the site computed: a crown bid
the payer can edit downward on the payment page is not a bid.

### Do not

- **Create discount codes.** The clock credits what was actually paid, so a
  code does not corrupt the ledger — but it does let somebody take the top
  position for less than the page said it costs, which is the one promise this
  site makes.
- **Create a second product** for the two tiers. They differ only by amount and
  by a `tier` value in the checkout metadata; a second product id would need a
  second `POLAR_PRODUCT_ID` and there is only one.
- **Attach checkout fields or benefits.** The name and the link are collected
  on the site before checkout and travel as metadata. Asking again on Polar's
  page collects the same thing twice and contradicts "no accounts".

---

## 4. Webhook

The webhook is the only thing in the codebase that can move the clock, so this
section is the one to get right.

| Field | Value |
| --- | --- |
| URL | `https://lastlight.lol/api/webhooks/polar` |
| Format | Raw / Standard Webhooks (**not** Slack or Discord) |
| Secret | generated by Polar → `POLAR_WEBHOOK_SECRET` |
| Events | `order.created`, `order.paid`, `order.updated` |

All three order events are subscribed deliberately. Any one of them is enough
to credit a payment, and the ledger dedupes on the order id inside the same
transaction that moves the clock, so duplicates and retries cost nothing. What
would cost something is subscribing to only the event Polar happens to stop
sending.

Deliveries are verified as Standard Webhooks — HMAC-SHA256 over
`id.timestamp.body`, five-minute tolerance — and an unsigned or stale delivery
is answered 403 without touching the clock.

---

## 5. The environment variables this produces

| Variable | Where it comes from |
| --- | --- |
| `POLAR_ACCESS_TOKEN` | Settings → an organization access token |
| `POLAR_PRODUCT_ID` | the product's id, from its dashboard URL or the API |
| `POLAR_WEBHOOK_SECRET` | shown once when the webhook endpoint is created |
| `POLAR_SERVER` | `sandbox` while testing, `production` when live |

All three of the first group or none: the app refuses to boot with one or two
of them set, because a checkout that no webhook can verify takes money and
never moves the clock.

`POLAR_SERVER` picks the host, not a flag on one host — sandbox and production
are separate systems with separate organizations, products, tokens and
secrets. Testing in sandbox means creating all of this twice, which is the
point: the sandbox run is where you find out whether the ledger line appears.
