# Arena Vision — AI Proof & Shot Tracking

Full add-on for basketball shot tracking (Ball AI-style) and golf round proof with AI review.

## In-person challenges (all types)

Every `kind: in_person` challenge now uses the same AI proof pipeline:

1. Both players **check in**
2. Optional **Record with Arena Vision** (sport-specific: shooting session, golf, etc.)
3. Winner **reports + proof bundle** (proof required for all in-person)
4. **AI review** + opponent **confirm/dispute** (12h auto-confirm)
5. On complete → **auto leaderboard sync** when AI produced a score (e.g. 3s in 60s → `three_pointers_60s`)

Game-type mapping lives in `lib/data/inPersonVisionConfig.ts` — **all 50+ spots categories** plus every create-screen in-person preset. Sport-specific AI prompts live in `lib/data/aiReviewPrompts.ts` (mirrored in `supabase/functions/_shared/aiReviewPrompts.ts`).

| AI tier | Activities |
|---------|------------|
| **Shot tracker** (YOLO/OpenCV + arc check) | Basketball shooting drills: 3s, free throws, midrange, layups, half-court, around the world |
| **Golf AI** | Drives, closest-to-pin, putting, wedges, scorecard rounds |
| **Wearable sync** | Running — Apple Health import (iOS dev build), Garmin GPX import, or screenshot fallback |
| **Vision LLM proof** | Fitness, soccer, pickleball, tennis, volleyball, frisbee, 1v1/team match clips, HORSE, knockout |
| **Not feasible** | Opponent-required formats with no proof surface (none — all require proof upload) |

## Per-activity validation (`lib/data/inPersonAiValidation.ts`)

Every spots slug maps to a validator:

| Validator | Validates |
|-----------|-----------|
| `shot_tracker` | Basketball shooting — auto-count makes via Python service; 3pt behind-arc, free throw line, half-court line CV + timed recording |
| `golf_vision` | Swing/scorecard/distance from video |
| `vision_time` | Running times from timer/finish footage |
| `vision_count` | Fitness reps, targets, juggles |
| `vision_match` | 1v1/team final score + both players visible |
| `vision_streak` | Consecutive makes (penalties, FT streak) |
| `vision_distance` | Carry, closest-to-pin |
| `vision_level` | Beep test level |

`validateInPersonProof()` in `lib/backend/inPersonAiValidation.ts` routes each activity, compares AI-detected vs reported score, and returns approve/review/reject.

Arena submits **require proof** (video when mandated). Challenge in-person reports use the same orchestrator.

## What's included

### 1. AI Proof Review (matches)
- Multi-file proof upload (1–3 clips/photos + score)
- OpenAI vision analysis via `ai-review-match` edge function
- Works for **e-game** and **in-person** challenges
- Opponent confirm/dispute flow (existing tiered verification)

### 2. Basketball Shot Tracker
- Record shooting session video from app (sideline/baseline angle, 60s auto-stop for timed drills)
- Python service (`services/shot-tracker`) detects makes/misses + per-shot court position checks
- OpenCV motion peaks + optional YOLO ball/person detection + Hough line heuristics (3pt arc, FT line, half-court)
- Second-pass OpenAI rule review flags layups, over-time videos, and wrong camera angles
- Shot-by-shot recap with FG%, streak, arc tags, and rule flags

### 3. Golf Round Proof
- Create round → GPS check-in → hole scores → scorecard upload
- AI reads scorecard via `ai-review-golf` edge function
- Optional tee shot video proof

## Setup

### 1. Run migration

```bash
npx supabase db push
```

### 2. Deploy edge functions

```bash
npm run deploy:functions
```

Or individually:
```bash
npx supabase functions deploy ai-review-match
npx supabase functions deploy analyze-shooting-session
npx supabase functions deploy ai-review-golf
```

### 3. Set Supabase secrets

```bash
npx supabase secrets set OPENAI_API_KEY=sk-your-key
npx supabase secrets set OPENAI_VISION_MODEL=gpt-4o-mini
npx supabase secrets set SHOT_TRACKER_URL=https://your-shot-tracker.example.com
```

### 4. Start shot tracker (local dev)

```bash
cd services/shot-tracker
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Then set `SHOT_TRACKER_URL=http://YOUR_LAN_IP:8000` in Supabase secrets (use your machine's IP, not localhost, for device testing).

### 5. Wearable import (running)

- **Apple Health** — iOS dev client only (`eas build --profile development --platform ios`). HealthKit plugin is in `app.json`; import reads recent run workouts via `@kingstinct/react-native-healthkit`.
- **Garmin** — export GPX from Garmin Connect and import on `/vision/run-wearable`.
- **Screenshot** — still accepted as fallback when native import is unavailable.

## App routes

| Route | Purpose |
|-------|---------|
| `/vision` | Arena Vision hub |
| `/vision/shooting-session` | Record + analyze basketball |
| `/vision/shooting-session/[id]` | Session recap |
| `/vision/run-wearable` | Running — Apple Health / Garmin GPX / screenshot |
| `/golf` | Golf proof hub |
| `/golf/start` | New round |
| `/golf/[sessionId]/checkin` | GPS + group photo |
| `/golf/[sessionId]/score` | Hole-by-hole entry |
| `/golf/[sessionId]/submit` | Scorecard + AI review |

## Database tables

- `match_proofs`, `ai_match_reviews` — match proof bundles
- `shooting_sessions`, `tracked_shots` — basketball tracking
- `golf_sessions`, `golf_hole_scores`, `golf_proofs`, `golf_ai_reviews` — golf rounds

## Without OpenAI / shot tracker

The system still works in degraded mode:
- Proof uploads succeed
- Heuristic AI review returns `needs_review`

### Shooting fallback chain

1. **Python shot tracker** (OpenCV + optional YOLO) when `SHOT_TRACKER_URL` is set
2. **OpenAI vision** (frame sampling in Python, or video upload in edge function) when tracker fails or returns 0 shots
3. Session marked `failed` only if both paths fail

Set `OPENAI_API_KEY` on the shot-tracker service **and** Supabase edge secrets for full fallback coverage.

## Improving accuracy

1. Train custom YOLO model on Roboflow (basketball + hoop classes)
2. Set `YOLO_MODEL_PATH` env on shot tracker service
3. Use tripod + fixed camera angle for best results
4. Golf: clear scorecard photos, good lighting
