# lastlight.lol

A single page with a countdown that starts at 24 hours and runs down in real
time. When it reaches zero the site freezes permanently and cannot be revived.
Anyone can pay to add time. How much time a payment buys depends entirely on
how close to death the site is.

Built from [`docs/prd.md`](docs/prd.md), which is the spec and the argument for
why the mechanic is shaped this way. The PRD is kept as originally written; see
[Where this departs from the PRD](#where-this-departs-from-the-prd) for what has
changed since, and why.

The repository is still named `keepitalive` because renaming a remote is the
owner's call. Everything the product calls itself is `lastlight.lol`.

## The mechanic

Every payment is a **bid** and a **transfusion** at once, and the two are priced
on opposite curves.

**Time gets cheaper as death approaches:**

```
seconds_added = amount_usd x 6 x (86400 / seconds_remaining)   capped at 2 hours
```

$20 buys about two minutes at 23 hours remaining and the full two-hour cap
under ten minutes.

**Standing gets more expensive.** There is one position, The Last Light. Taking
it costs at least a dollar more than the current holder paid, and it never
decays. Whoever holds it when the clock hits zero holds it on the dead page
forever.

Underneath it is **the board**: every site that has paid, ranked by everything
it has ever paid, with the exact cost of passing the site above printed on its
row. There are no accounts, so identity is the hostname, and every payment from
the same host adds up into one position. That is what makes a $3 payment worth
making when the Last Light is sitting at $400.

So waiting makes time cheaper and the Last Light dearer, and no moment is an
obvious one. The two-hour cap means survival needs many payers rather than one
rich one.

| Rule | Value |
| --- | --- |
| Minimum transfusion | $3 |
| Opening Last Light price | $5 |
| Last Light increment | current + $1 |
| Maximum time per transaction | 2 hours |
| Maximum clock value | 72 hours |
| Revival after death | Impossible |

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # the rules, the store, the concurrency and death cases
npm run build
```

With no Redis and no Polar configured, the app runs on an in-memory store and a
simulated checkout, so the whole mechanic is playable locally. Simulated
payments are refused in production builds unless `ALLOW_SIMULATED_PAYMENTS=1` is
set, which exists for screenshots and nothing else.

Copy `.env.example` to `.env.local` to point it at real services.

Useful for looking at a state you would otherwise have to wait for:
`CLOCK_LAUNCH_AT` is a unix-ms instant the clock started, so setting it into the
past starts the app near death, and setting it far enough back starts it dead.

## How it is put together

| Path | What it is |
| --- | --- |
| `lib/clock.ts` | Every rule as a pure function. No I/O, no clock reads. |
| `lib/store/script.ts` | The same arithmetic in Lua, for atomicity. |
| `lib/store/redis.ts` | Upstash backend. |
| `lib/store/memory.ts` | In-memory backend for dev and tests. |
| `lib/standings.ts` | Folds the ledger into a ranked board of sites. |
| `lib/polar.ts` | Checkout creation and Standard Webhooks verification. |
| `app/api/webhooks/polar` | The only thing that moves the clock. |
| `components/Countdown.tsx` | The clock, and most of the dread. |
| `components/Bulb.tsx` | The three.js bulb, lazy-loaded. |
| `components/ui/paper-grain.tsx` | The background tooth, one SVG filter. |
| `components/Standings.tsx` | The board. |
| `components/ui/site-link.tsx` | Every outbound link, and its rel attributes. |
| `components/Memorial.tsx` | The dead state. |

### Redis keys

The key and the type are still called `lifeline`, which is what the product
called The Last Light before it was renamed.

```
clock:expires_at   unix ms
clock:frozen       JSON snapshot, written once at death
lifeline           JSON {name, url, amount, ts}
ledger             append-only list, newest first
clock:seen         set of processed payment ids
```

The first four are the product. `clock:seen` is a deliberate fifth: Polar
retries webhooks, and without an idempotency set a retry would grant the same
payment's time twice. It holds payment ids and nothing else.

### Things worth knowing

**The transaction is atomic.** Two payments landing at four minutes remaining
must not both price off the same pre-payment clock, so reading the clock,
applying the curve, the cap and the ceiling, moving the Last Light and appending
the ledger line all happen inside one Lua script. The in-memory store mirrors it
behind a promise chain. The arithmetic exists twice on purpose, and
`lib/clock.test.ts` asserts the two copies have not drifted.

**Death is lazy.** There is no cron. If `now > expires_at` the site is dead; the
first request after that writes `clock:frozen` and every request afterwards
serves it. A webhook arriving after the freeze is answered 200, logged as
needing a refund, and never converted into time.

**A bid that loses its race still counts.** If somebody outbids you between
checkout and webhook, the payment does not take the Last Light but still buys
time, a permanent ledger line, and its full weight on the board, so nobody pays
for nothing.

**The price is an ad-hoc price, not `amount`.** Polar's top-level `amount` field
applies only to pay-what-you-want prices and is documented as ignored for fixed
ones. An escalating bid sent that way would have quietly charged the catalog
price every time. The checkout instead creates a per-session fixed price:

```json
{ "products": ["prod_x"],
  "prices": { "prod_x": [{ "amount_type": "fixed", "price_amount": 4700, "price_currency": "usd" }] } }
```

`buildCheckoutBody` is a pure function so this is asserted in tests rather than
discovered in production.

**Nobody makes an account.** The checkout sends no `customer_id`, no
`external_customer_id` and no email. Polar collects what a payment processor
must on its own hosted page, and the board is keyed on the link the payer typed,
not on any customer record. A test asserts those fields stay absent.

**The client never owns the clock.** It interpolates between ten-second polls
using `performance.now()`, which is monotonic, so a device with a wrong system
clock or one returning from sleep reconciles to the server instead of inventing
time.

**The peak is derived, and so is the board.** Each ledger entry records the clock
reading immediately after it, so "longest it ever reached" comes out of the
ledger rather than another key. The standings are folded out of the same list on
read, which is why the store hands back every entry and the page trims it.

## Design

The page is paper and it is calm. All of the dread is spent on the clock,
because a page where everything is shouting reads as an arcade and a page where
one thing is wrong reads as a problem.

Archivo carries the display voice, using its width axis so the clock can widen
as it degrades. Geist Mono carries the ledger. Both are self-hosted. Arterial
red is the page accent, withheld until the last ten minutes so its arrival is
information rather than decoration, and otherwise spent only on whoever is
holding the Last Light.

The board carries the one other use of colour: the top three cards are graded by
heat, warmest at the top, with everyone below them in a single neutral field.
The chroma is kept low enough that no tier competes with the accent, and the
colour lands on the rank numeral with only a wash on the card, because anything
stronger turns a deadpan board into a podium.

Outbound links all go through one component, which is also the only place the
`sponsored nofollow noopener` rel is written. They carry an arrow
([Phosphor](https://phosphoricons.com)) because an underline says "link" but
does not say the link leaves the page, and leaving the page is what these people
are paying for. In the ledger it doubles as the signal for which entries have a
link at all.

Above the clock hangs the bulb the site is named after, rendered in three.js.
Its filament burns down across the whole day on a square-root curve, losing
colour temperature from white through amber to a dull red, dimming, and
guttering more the closer it gets. The memorial shows the same bulb cold.

Four things make it read as lit glass rather than a grey ball on a stick:

- **A lathed A19 profile, not a sphere.** The neck, shoulder and tip are what
  make a silhouette a bulb. Shape borrowed from
  [threejs-realistic-bulb](https://github.com/wory-bonbon/threejs-realistic-bulb),
  which builds the envelope the same way.
- **A fresnel shell, not a translucent solid.** Opacity over a light ground
  removes contrast instead of adding it, so a white sphere on white paper can
  only ever look grey. Real glass is close to invisible face-on and gathers at
  the silhouette: a faint warm tint across the body, a cool edge at the rim, one
  specular highlight.
- **A noise-driven glow**, after prisoner849's
  [The Lonely Candle](https://discourse.threejs.org/t/the-lonely-candle/4097).
  Rather than lighting a mesh and hoping, the light is a shader with procedural
  noise and a gradient from a hot core out to transparent, so the filament
  breathes and the guttering falls out of the noise instead of a random number.
- **Normal blending, never additive.** On a light page you cannot make something
  look lit by adding brightness, because the paper is already at the top of the
  range. The glow reads as light by tinting the paper warm, which is also why
  the pool it throws is a warm wash rather than a white one.

It is lazy-loaded so it never blocks the clock, stops rendering when the tab is
hidden or the filament is cold, and the page is complete without WebGL.

The clock escalates through five states, all hung off `<main data-state>`:

| Remaining | State |
| --- | --- |
| over 1h | Calm. Ink on paper. |
| under 1h | Heavier and wider, the press starting to drift, still grey. |
| under 10m | The drift widens, one copy goes arterial, the ink bleeds. |
| under 60s | Everything but the number is gone. Full red, and a tremor. |
| zero | Back into register, colour drained, flat grey. |

Two devices do the work. Misregistration, drawn with `text-shadow` so the whole
effect is one variable getting larger, and a scramble from Magic UI's
[HyperText](https://magicui.design/docs/components/hyper-text), vendored in
`components/ui/hyper-text.tsx` and adapted for a string that changes every
second. The scramble fires once when the clock crosses into each worse state
rather than running continuously: the last minute is exactly when somebody needs
to read this number.

Cell widths in the clock are measured rather than guessed, because Archivo's
width axis changes a digit's advance from 0.657em to 0.815em across the range
and the glyphs collide otherwise.

Behind everything is grain, not dots: one SVG turbulence filter multiplied over
the page so the paper has a tooth to it. A dot grid is a template signature
rather than a material, and this page is meant to read as a printed surface. It
renders on the server with no JavaScript, is fixed and pointer-events none so it
composites once, and coarsens as the clock runs down.

Every animation honours `prefers-reduced-motion`, where weight, drift and colour
carry the escalation on their own and the bulb holds a single still frame.

## Where this departs from the PRD

- **The name.** `keepitalive.lol` became `lastlight.lol`, and The Lifeline
  became The Last Light.
- **A board, which the PRD rules out.** Section 4.1 says one position, not a
  leaderboard, on the grounds that a leaderboard has no ending. The standings
  are added anyway because ranking a link is the thing most payers are actually
  buying, and the single Last Light still sits above the board as the object
  with the ending attached.
- **A fifth Redis key**, `clock:seen`, for webhook idempotency.
- **The bulb**, which is new scope the PRD's section 7 would have called a
  moving part. It is lazy-loaded and optional at runtime for that reason.

## Not built

Accounts, email, revival, an admin panel, refunds beyond the post-death case,
comments, search. See section 9 of the PRD.
