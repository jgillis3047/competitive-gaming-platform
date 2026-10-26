# Arena Shot Tracker

Python service for basketball make/miss detection from phone video.

## Quick start

```bash
cd services/shot-tracker
python -m venv .venv
.venv\Scripts\activate   # Windows
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

## Deploy

Build and run with Docker, or deploy to Railway/Render/Fly.io.

Set in Supabase Edge Function secrets:

```
SHOT_TRACKER_URL=https://your-shot-tracker.example.com
OPENAI_API_KEY=sk-...          # proof review + shooting fallback
OPENAI_VISION_MODEL=gpt-4o-mini
```

On the **shot-tracker service** itself, also set `OPENAI_API_KEY` so Python can fall back to vision when OpenCV/YOLO returns 0 shots.

## How it works

1. App uploads shooting video to Supabase Storage
2. `analyze-shooting-session` edge function calls `POST /analyze`
3. Service detects motion peaks (shot attempts) in upper frame
4. Each peak classified make/miss via YOLO ball detection or heuristics
5. If tracker fails or finds 0 shots, **OpenAI vision** samples frames and counts makes/misses
6. Edge function repeats OpenAI fallback if the Python service is unreachable
7. Results written to `shooting_sessions` + `tracked_shots`

## Tips for best results

- Phone on tripod, facing the hoop
- Full body + hoop visible
- 2–5 minute sessions
- Free throws or spot shooting (not full court 5v5)

## Optional YOLO model

Set `YOLO_MODEL_PATH` to a custom basketball model trained on Roboflow for better accuracy.
