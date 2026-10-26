# Arenas — real-world territory competition

Arena is **infrastructure for real-world ranked territory competition**, not a generic social or media app. The core loop:

1. **Discover** an arena (verified physical location)
2. **Challenge** a player or the current king
3. **Meet** on-site (GPS check-in)
4. **Play** the match
5. **Upload proof** (clip link or media)
6. **Crown transfers** — arena feed updates
7. **Others challenge** next

Launch **one niche first** (e.g. local basketball courts). Dominate crown + verified matches + rivalries before expanding game types.

## Terminology (user-facing)

| Generic | Arena language |
|---------|----------------|
| Leaderboard | Rankings / Arena history |
| Location / spot | **Arena** |
| Create location | **Claim New Arena** |
| Current leader | **King** / **Current king** |
| Win streak | **Defend crown** / **Win streak** |
| Overtake leader | **Dethrone** / **Dethroned** |
| Empty title | **Crown open** |
| Application pending | **Pending verification** |

Tagline direction: *Real-world ranked territory. Defend your crown.*

## 1. Claim New Arena

User taps **Claim New Arena** and provides:

| Field | Required |
|-------|----------|
| Arena name | Yes |
| Category / game type | Yes |
| Address or GPS pin | Yes (must be on-site) |
| 1–3 photos | Yes (live camera at creation) |
| Short description | Yes |
| Public or private | Optional (MVP: public only) |
| Hours / availability | Optional |

New arenas enter **Pending verification** — not fully competitive until approved.

## 2. Verification layer

Balance: easy enough to add locations, hard enough to stop spam, structured enough for long-term hubs.

### A. GPS presence (implemented MVP)

- User must physically be at the pin
- ~45s dwell timer while staying within check-in radius
- Location re-checked before submit

### B. Photo verification (implemented MVP)

- Live camera capture only at arena creation (no gallery for first photos)
- Wide angle / recognizable landmark encouraged in copy

### C. Community approval (implemented MVP)

- Pending arenas visible to nearby users with **Confirm this arena** action
- After **3 confirmations** → automatically **approved**
- Admin can approve/reject anytime (future admin UI)
- Report fake (existing report flow)

### Anti-abuse (roadmap)

- Arena creation cooldown (e.g. max N/day)
- Account age / activity gates
- Duplicate detection (proximity + name similarity)
- Trust scores from verified matches and accurate reports

## 3. Arena becomes permanent

Once **approved**, the arena gets:

- Rankings and king title
- Match / score history
- Activity feed
- Proof clips on record

Users can challenge, check in, and defend the crown there.

## 4. Becoming king

- Win verified matches at that arena
- ELO / rankings update
- Current king shown publicly (name, record, defenses)

## 5. Match proof & verification levels

After a match or score submission:

| Level | Requirements |
|-------|----------------|
| **Basic** | GPS check-in + score (default) |
| **Verified** | + TikTok / YouTube / Instagram Reel link **or** uploaded clip |
| **Featured** | High-engagement clip + community approval (future) |
| **Legendary** | Tournament / upset / streak breaker (future) |

Accepted social proof links:

- TikTok
- YouTube / YouTube Shorts
- Instagram Reel

Still require GPS proximity and both players confirming for head-to-head matches (challenges).

## 6. Arena status tiers

Computed from activity (not manually assigned):

| Tier | Criteria (MVP) |
|------|----------------|
| **Bronze** | Newly verified |
| **Silver** | 25+ match attempts logged |
| **Gold** | High activity: 10+ unique competitors + activity in last 7 days |
| **Legendary** | 100+ attempts, 20+ competitors, sustained weekly activity |

Tiers appear on arena pages and map pins as reputation signals.

## 7. Product principles

- **Trust is everything** — fake rankings kill the product
- **Proof is content** — clips market the app organically (“Dethroned the king at Sunset Park 👑”)
- **Physical location = identity** — the differentiator vs normal gaming apps
- **Don't start broad** — one local scene obsessed with the app = proof of concept
- **Language matters** — “Pull up and take my crown” > generic “play a game”

## Implementation map

| Area | Code |
|------|------|
| Claim flow UI | `app/courts/create.tsx` |
| Arena hub | `app/courts/[id]/index.tsx` |
| Score + proof submit | `app/courts/[id]/submit.tsx` |
| Copy constants | `lib/theme/arenaCopy.ts` |
| Backend | `lib/backend/courts.ts`, migrations |
| Explore / map | `app/(tabs)/leaderboards.tsx`, `app/courts/index.tsx` |

## Explore vs Pulse (tabs)

| Tab | Mental model | Purpose |
|-----|----------------|---------|
| **Explore** | WHERE | Map, nearby arenas, top kings nearby, claim territory |
| **Pulse** | WHAT'S HAPPENING | Dethronings, open challenges, clips, crown moments |

Physical locations are **arenas**. The live feed tab is **Pulse** to avoid overloading the word "Arena."

## Crown vs all-time rankings

Three layers (do not collapse into one number):

1. **Crown holder** — Current king at this spot. Socially primary. Should transfer on verified **head-to-head crown challenges**, not automatically to whoever has the most lifetime wins.
2. **Arena rankings** — All-time / best scores at this spot. Grindable; supports "he's #1 all-time but I took his crown."
3. **Streaks / defenses** — Reign length, defense count, undisputed badges (roadmap).

UI rule: crown is hero on every arena page; rankings live under the **Rankings** tab inside that arena, not a global tab.

Target drama example:

- Leaderboard: Jordan — 30 wins, Mike — 12 wins  
- Crown: 👑 Mike (beat Jordan yesterday)

## Arena page layout

```
[Crown hero — name, reign, Challenge King]
[Stats row — optional]
[Activity | Rankings | Clips | History]
```

- **Activity** — recent energy, link to Pulse  
- **Rankings** — top competitors at this arena only  
- **Clips** — TikTok / proof links  
- **History** — past kings timeline (roadmap)

## Where leaderboards should NOT live

- No dedicated global "Leaderboard" tab as primary identity  
- Global/friends stats stay under Explore → "Stats & city boards" (advanced)

