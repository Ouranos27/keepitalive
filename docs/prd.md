# keepitalive.lol — PRD

**Status:** draft, pre-build
**Domain:** keepitalive.lol ($1.99/yr, available as of 2026-08-26)
**Build budget:** one day. If it runs to two, it has failed its own brief.
**Category:** ephemeral novelty / attention play, August 2026 `.lol` pay-to-rank wave

---

## 1. What it is

A single web page containing a countdown clock that starts at 24 hours and runs down in real time. When it reaches zero, the site permanently freezes and can never be revived.

Anyone can pay to add time to the clock. The same payment also buys them a position on a public leaderboard. How much time a given payment buys depends entirely on how close to death the site is.

There are no accounts, no logins, no admin panel, and no second chances.

---

## 2. Why this shape

The `.lol` bidding wave began 19 August 2026 and is currently saturated with pure pay-to-rank leaderboards — highest bidder on top, continuously, zero-sum. Roughly two hundred boards exist within a week of the original.

Two structural problems with that format, both of which this design targets:

1. **No reason to return.** A board with no new bids is a dead page with a payment button. Payment is the last interaction, not the first.
2. **No narrative.** A leaderboard has no ending. Nothing is at stake, nothing resolves, and there is no moment worth showing up for.

The countdown fixes both. The price of standing escalates, so holding it requires paying again. And the site has an ending, which means it has a final hour — the only moment in this entire product category worth camping.

**Positioning line:** *This site dies in 24 hours unless you pay.* The leaderboard is discovered after arrival, not led with.

---

## 3. Core mechanic

### 3.1 The clock

- Starts at exactly 24:00:00 on launch.
- Decrements in real time, always.
- Displayed to the second, server-authoritative.
- At zero: permanent freeze. No revival path exists in code.

### 3.2 Payment does two things at once

Every payment is simultaneously a **bid** (buys standing) and a **transfusion** (buys time). The two are priced on opposite curves, and that opposition is the game.

**Standing gets more expensive over time.** There is one position, not a leaderboard — The Lifeline. To take it you must pay more than whoever currently holds it, minimum $1 over. King of the hill, no decay, no rows.

**Time gets cheaper as death approaches.**

```
seconds_added = amount_usd × 6 × (86400 / seconds_remaining)
capped at 7200 (2 hours) per transaction
```

What $20 buys in time:

| Remaining | Time added | Effect |
|---|---|---|
| 23h | ~2 min | negligible |
| 12h | ~4 min | negligible |
| 6h | ~8 min | marginal |
| 1h | ~48 min | meaningful |
| 30 min | ~1h 36m | strong |
| under ~10 min | 2h (capped) | maximum |

### 3.3 Two tiers, one payment flow

- **Crown** — pay more than the current holder. Takes The Lifeline. Escalating, uncapped, the competitive object.
- **Transfusion** — flat $3 minimum. Buys time and a permanent line in the ledger. Does not take the crown.

Both buy time on the scarcity curve above. The second tier exists so that when the crown sits at $400, there is still a $3 way in — otherwise the site is unplayable for everyone but two people.

### 3.4 Why this produces tension in both directions

Waiting makes time cheaper. Waiting makes the crown more expensive. Every moment is therefore a real decision rather than an obvious one, and the payments spread across the full day instead of clustering in the last ten minutes.

Late in the clock both curves point the same way — time is at its cheapest and the crown is about to be locked forever — which is what produces the endgame bidding war.

### 3.5 The 2-hour cap

Without a cap, one person with $500 ends the drama on day one by buying the clock up to a week. The cap means survival requires *many* payers, not one rich one. Note that the cap applies to time only: crown bids are uncapped in dollars, they simply stop buying additional time past 2 hours.

---

## 4. Rules

| Rule | Value | Rationale |
|---|---|---|
| Minimum transfusion | $3 | Processor fees eat a $1 transaction |
| Opening crown price | $5 | Low enough that the first bid happens fast |
| Crown increment | current + $1 minimum | Standard king-of-the-hill |
| Crown maximum | none | Escalation is the revenue mechanic |
| Maximum time per transaction | 2 hours | Prevents a single payer ending the tension |
| Maximum clock value | 72 hours | Hard ceiling; excess buys standing only |
| Name field | Optional, 24 chars | No accounts, ever |
| URL field | Optional | This is why people pay; `rel="sponsored" nofollow` |
| Revival after death | Impossible | Not a config flag — not in the code |

### 4.1 The Lifeline

One slot. Held by whoever paid most recently *and* highest. Displayed alone, large, with name and link. Displaced only by someone paying more.

The current price to take it is always shown as a single number — "Take The Lifeline: $47" — not a bid box. Removing the decision of how much to bid removes the main reason people bounce.

No decay. Escalation already forces movement; decay would lower the bar over time and works against it.

### 4.2 What everyone else gets

Every transfusion appends a permanent line to the public ledger: name, link, amount, seconds contributed, timestamp. The ledger survives death. That is the $3 product, and it is why the cheap tier is worth buying at all.

---

## 5. The dead state

**Design this page first.** It is what outlives the event, what gets linked afterwards, and what makes the final hour valuable in advance.

On death, the page permanently becomes:

- The frozen time of death, to the second
- **The final Lifeline holder**, headline treatment, permanent, with their link
- Total raised, total payers, longest the clock ever reached
- Full chronological ledger of every payer, in order, from first to last

Whoever holds #1 at zero holds it forever. Stated prominently on the live site — it is the reason the last bid is the most valuable one.

---

## 6. Design

Deadpan. Every clone in this wave is neon, emoji, dark mode, purple gradient. The domain already carries the joke; the site should not repeat it. **Obituary, not arcade.**

- **Background:** warm ivory (`#FAF8F3`), not dark mode. A death clock on paper is unsettling; a death clock on black reads as a game.
- **Type:** JetBrains Mono, tabular figures, for every number. Instrument Serif for the few words that exist.
- **Hierarchy:** the clock is most of the viewport. The Lifeline holder, the two buttons, and the ledger are small and beneath it. Comprehension must precede reading.
- **One accent color,** used only in the final ten minutes, so its arrival means something.
- **No animation beyond the tick.**

### 6.1 Degradation states

The page visibly deteriorates as the clock does. This is where the effort goes — it makes the state legible in a screenshot, so the site generates its own escalating images.

| Remaining | State |
|---|---|
| > 6h | Calm. Full layout, board visible. |
| < 1h | Type weight increases. Board demotes. |
| < 10 min | Background warms toward red. Accent color appears. |
| < 60 sec | Everything but the number falls away. |
| 0 | Freeze. Memorial layout. |

---

## 7. Technical

Deliberately minimal. Any additional service is scope failure.

- **Framework:** Next.js 15 on Vercel
- **State:** Upstash Redis (three keys, no relational DB)
- **Payments:** Polar.sh, webhook is the sole source of truth
- **Analytics:** OpenPanel
- **Fonts:** self-hosted

### 7.1 Data model

```
clock:expires_at        → unix ms integer
clock:frozen            → JSON snapshot, written once at death
lifeline                → JSON {name, url, amount, ts} — current crown holder
ledger                  → list, append-only, {name, url, amount, seconds_added, ts}
```

### 7.2 Death handling

No cron, no scheduled function. Death is evaluated lazily on read: if `now > expires_at`, the site is dead. The first request after expiry writes `clock:frozen` and every subsequent request serves that snapshot.

### 7.3 Concurrency

Time addition must be atomic — a Lua script that reads `expires_at`, computes `seconds_added` from the *current* remaining time, applies the cap and the 72h ceiling, and writes back in one operation. Two simultaneous payments at 4 minutes remaining must not both compute their bonus from the same pre-payment state.

Reject any webhook arriving after `clock:frozen` exists. Refund, do not extend.

### 7.4 Client clock

Client interpolates locally between server polls (every 10s) for smooth ticking, but the server value always wins on reconciliation. Never trust client time.

---

## 8. Build sequence

1. Memorial/dead page — static, complete, good
2. Redis clock + the Lua transaction script
3. Live page with degradation states
4. Polar checkout + webhook
5. Crown flow: escalating price, displacement, ledger
6. Deploy, verify with real $3 payment
7. Launch

If you are writing a database schema with more than the four keys above, you have left the brief.

---

## 9. Non-goals

Accounts. Email. Revival. Admin panel. Multiple simultaneous boards. Mobile app. Refunds beyond the post-death case. Comments. Categories. Search. Any feature justified by "if it takes off."

---

## 10. Risks, honestly stated

**The audience problem is unsolved and unsolvable by design work.** The original board earned ~$21.5k in 24 hours because one person had several thousand people looking at it within the first six hours. The mechanic was three hours of code. Roughly two hundred boards have shipped since by people without that audience, and they are sitting on zero bids and a dead page. Nothing in this document addresses that, and no amount of mechanical refinement will.

**The wave is a week old.** Day one was 19 August. Directories of the directories exist. Review sites scanning live bid data exist. Late entrants capture close to nothing.

**Expected value is a Saturday, not a business.** This is priced as a lottery ticket costing one day. That is a fine purchase. The failure mode is not losing the Saturday — it is the week afterwards spent tuning a dead clock while Contrateo sits untouched.

**Pre-build check:** confirm `killswitch.lol` and `timeleft.lol` resolve to nothing. Both were registered during this wave. If either is a live countdown, this is a clone and the premise collapses.

---

## 11. Definition of done

Ships in one day. Works at $3. Dies correctly and irreversibly. Looks nothing like the other two hundred.

Whatever happens after that, it is over — because the product is over. That property is the reason to build this one rather than a leaderboard.
