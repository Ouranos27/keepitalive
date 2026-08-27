/**
 * The atomic half of the store.
 *
 * Two simultaneous payments at four minutes remaining must not both compute
 * their bonus from the same pre-payment state, so the whole transaction
 * (read the clock, apply the curve, the cap and the ceiling, move the crown,
 * append the ledger line) happens inside one Lua script.
 *
 * The arithmetic here mirrors lib/clock.ts. lib/clock.test.ts asserts that the
 * constants below match the TypeScript ones, because the two copies drifting
 * apart is the one bug this design can produce.
 */
import {
  CROWN_INCREMENT_USD,
  INITIAL_SECONDS,
  MAX_CLOCK_SECONDS,
  MAX_SECONDS_PER_TX,
  OPENING_CROWN_USD,
} from "../clock";

/**
 * KEYS: expires_at, frozen, lifeline, ledger, seen
 * ARGV[1] now (unix ms), ARGV[2] expiry to use if the clock has never been set
 */
const PRELUDE = `
local K_EXPIRES, K_FROZEN, K_LIFELINE, K_LEDGER, K_SEEN =
  KEYS[1], KEYS[2], KEYS[3], KEYS[4], KEYS[5]
local now = tonumber(ARGV[1])
local cold_expires = tonumber(ARGV[2])

local INITIAL = ${INITIAL_SECONDS}
local MAX_CLOCK = ${MAX_CLOCK_SECONDS}
local MAX_TX = ${MAX_SECONDS_PER_TX}
local OPENING_CROWN = ${OPENING_CROWN_USD}
local CROWN_INC = ${CROWN_INCREMENT_USD}

-- Explicit %.0f formatting. Lua 5.1's default number-to-string conversion would
-- hand back 1.7566e+12 for a millisecond timestamp and the caller would parse a
-- rounded clock.
local function num(n)
  return string.format('%.0f', n)
end

local function decode(raw)
  if raw == false or raw == nil then return nil end
  local ok, value = pcall(cjson.decode, raw)
  if ok then return value end
  return nil
end

-- The clock is created on first read, not by a deploy step.
local function ensure_clock()
  local raw = redis.call('GET', K_EXPIRES)
  if raw == false then
    redis.call('SET', K_EXPIRES, num(cold_expires))
    return cold_expires
  end
  return tonumber(raw)
end

-- Death is evaluated lazily on read. The first request after expiry writes the
-- snapshot; every request after that reads it. Written once, never rewritten.
local function freeze(expires_at)
  local existing = redis.call('GET', K_FROZEN)
  if existing ~= false then return existing end

  local entries = redis.call('LRANGE', K_LEDGER, 0, -1)
  local total_raised = 0
  local peak = INITIAL
  for i = 1, #entries do
    local entry = decode(entries[i])
    if entry then
      total_raised = total_raised + (tonumber(entry.amount) or 0)
      local reached = tonumber(entry.remaining_after) or 0
      if reached > peak then peak = reached end
    end
  end

  local holder = decode(redis.call('GET', K_LIFELINE))
  if holder == nil then holder = cjson.null end

  local encoded = cjson.encode({
    died_at = expires_at,
    lifeline = holder,
    total_raised = total_raised,
    total_payers = #entries,
    peak_seconds = peak,
  })
  redis.call('SET', K_FROZEN, encoded)
  return encoded
end
`;

/**
 * Read the world. Freezes on the way out if the clock has run down.
 * ARGV[3] = how many ledger lines to return (-1 for all).
 *
 * Returns: { 'alive'|'dead', expires_at | frozen_json, lifeline_json, [entries], len }
 */
export const READ_SCRIPT = `${PRELUDE}
local limit = tonumber(ARGV[3])
local expires_at = ensure_clock()
local lifeline = redis.call('GET', K_LIFELINE)
if lifeline == false then lifeline = '' end
local stop = -1
if limit >= 0 then stop = limit - 1 end
local entries = redis.call('LRANGE', K_LEDGER, 0, stop)
local length = redis.call('LLEN', K_LEDGER)

if now >= expires_at then
  return { 'dead', freeze(expires_at), lifeline, entries, length }
end
return { 'alive', num(expires_at), lifeline, entries, length }
`;

/**
 * Apply one payment. The whole thing, or none of it.
 *
 * ARGV[3] id, [4] amount usd, [5] tier, [6] name ('' = anonymous),
 * ARGV[7] url ('' = none), [8] ts (unix ms)
 *
 * Returns: { 'applied', applied, granted, crowned, new_expires } | { 'dead' } | { 'duplicate' }
 */
export const APPLY_SCRIPT = `${PRELUDE}
local id = ARGV[3]
local amount = tonumber(ARGV[4])
local tier = ARGV[5]
local name = ARGV[6]
local url = ARGV[7]
local ts = tonumber(ARGV[8])

-- Polar retries webhooks. Paying twice for one payment would be a bug that
-- prints money for the payer and time for nobody.
if redis.call('SISMEMBER', K_SEEN, id) == 1 then
  return { 'duplicate' }
end

local expires_at = ensure_clock()
if now >= expires_at then
  freeze(expires_at)
  return { 'dead' }
end

local remaining = (expires_at - now) / 1000

-- Time gets cheaper as death approaches, and never buys more than two hours.
local granted = math.floor(amount * 6 * (INITIAL / remaining))
if granted > MAX_TX then granted = MAX_TX end

-- The 72h ceiling clips what the curve granted. The rest buys standing only.
local headroom = MAX_CLOCK - remaining
if headroom < 0 then headroom = 0 end
local applied = granted
if applied > headroom then applied = math.floor(headroom) end

local new_expires = expires_at + applied * 1000

-- Standing gets more expensive over time. One slot, minimum a dollar over.
local holder = decode(redis.call('GET', K_LIFELINE))
local price = OPENING_CROWN
if holder ~= nil and tonumber(holder.amount) ~= nil then
  price = tonumber(holder.amount) + CROWN_INC
end
-- A crown bid that lost the race in flight still buys time and a ledger line.
local crowned = tier == 'crown' and amount >= price

local name_value = cjson.null
if name ~= '' then name_value = name end
local url_value = cjson.null
if url ~= '' then url_value = url end

redis.call('SET', K_EXPIRES, num(new_expires))
if crowned then
  redis.call('SET', K_LIFELINE, cjson.encode({
    name = name_value, url = url_value, amount = amount, ts = ts,
  }))
end
redis.call('LPUSH', K_LEDGER, cjson.encode({
  id = id,
  name = name_value,
  url = url_value,
  amount = amount,
  tier = tier,
  crowned = crowned,
  seconds_added = applied,
  seconds_granted = granted,
  remaining_after = math.floor((new_expires - now) / 1000),
  ts = ts,
}))
redis.call('SADD', K_SEEN, id)

local crowned_flag = '0'
if crowned then crowned_flag = '1' end
return { 'applied', num(applied), num(granted), crowned_flag, num(new_expires) }
`;
