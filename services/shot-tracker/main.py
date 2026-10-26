"""
Basketball shot tracking service — Ball AI-style make/miss detection.

Uses OpenCV motion analysis + optional YOLO (ultralytics) when model is available.
Deploy separately: uvicorn main:app --host 0.0.0.0 --port 8000

Set SHOT_TRACKER_URL=http://localhost:8000 in Supabase edge function secrets.
"""

from __future__ import annotations

import base64
import json
import os
import tempfile
import urllib.request
from dataclasses import dataclass
from typing import Callable, List, Optional

import cv2
import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="Arena Shot Tracker", version="1.0.0")

# Optional YOLO — loads if ultralytics installed and model file exists
_yolo_model = None


def _get_yolo():
    global _yolo_model
    if _yolo_model is not None:
        return _yolo_model
    try:
        from ultralytics import YOLO

        model_path = os.environ.get("YOLO_MODEL_PATH", "yolov8n.pt")
        _yolo_model = YOLO(model_path)
    except Exception:
        _yolo_model = False
    return _yolo_model


class AnalyzeRequest(BaseModel):
    video_url: str
    session_type: str = "free_throw"
    record_slug: Optional[str] = None


class ShotResult(BaseModel):
    shot_number: int
    result: str  # make | miss
    confidence: float
    timestamp_start: float
    timestamp_end: float
    behind_arc: Optional[bool] = None
    behind_arc_confidence: float = 0.0


class AnalyzeResponse(BaseModel):
    total_shots: int
    makes: int
    misses: int
    fg_percent: float
    best_streak: int
    confidence: float
    shots: List[ShotResult]
    analysis_source: str = "opencv"
    qualified_makes: int = 0
    video_duration_sec: float = 0.0
    rule_flags: List[str] = []


def download_video(url: str) -> str:
    suffix = ".mp4"
    fd, path = tempfile.mkstemp(suffix=suffix)
    os.close(fd)
    urllib.request.urlretrieve(url, path)
    return path


@dataclass
class MotionPeak:
    frame_idx: int
    timestamp: float
    intensity: float


def detect_motion_peaks(cap: cv2.VideoCapture, fps: float) -> List[MotionPeak]:
    """Detect shot attempts via upward motion spikes in upper frame region."""
    peaks: List[MotionPeak] = []
    ret, prev = cap.read()
    if not ret:
        return peaks

    prev_gray = cv2.cvtColor(prev, cv2.COLOR_BGR2GRAY)
    h, w = prev_gray.shape
    # Focus on upper 60% where hoop typically is
    roi_h = int(h * 0.6)
    frame_idx = 1
    intensities: List[float] = []

    while True:
        ret, frame = cap.read()
        if not ret:
            break
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        roi_prev = prev_gray[:roi_h, :]
        roi_curr = gray[:roi_h, :]
        diff = cv2.absdiff(roi_prev, roi_curr)
        intensity = float(np.mean(diff))
        intensities.append(intensity)
        prev_gray = gray
        frame_idx += 1

    if len(intensities) < 10:
        return peaks

    arr = np.array(intensities)
    threshold = float(np.mean(arr) + np.std(arr) * 1.2)
    min_gap_frames = max(int(fps * 1.5), 15)  # min 1.5s between shots

    last_peak = -min_gap_frames
    for i, val in enumerate(intensities):
        if val > threshold and (i - last_peak) >= min_gap_frames:
            peaks.append(MotionPeak(frame_idx=i + 1, timestamp=(i + 1) / fps, intensity=val))
            last_peak = i

    return peaks


def detect_person_bbox(frame: np.ndarray) -> Optional[tuple[float, float, float, float]]:
    """Return (x1, y1, x2, y2) for largest person in frame via YOLO or fallback contour."""
    model = _get_yolo()
    h, w = frame.shape[:2]

    if model:
        results = model(frame, verbose=False, conf=0.3)
        best_area = 0.0
        best_box: Optional[tuple[float, float, float, float]] = None
        for r in results:
            for box in r.boxes:
                if int(box.cls[0]) != 0:  # person
                    continue
                x1, y1, x2, y2 = [float(v) for v in box.xyxy[0]]
                area = (x2 - x1) * (y2 - y1)
                if area > best_area:
                    best_area = area
                    best_box = (x1, y1, x2, y2)
        if best_box:
            return best_box

    # Fallback: largest moving blob in lower court region
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    roi = gray[int(h * 0.25) :, :]
    _, thresh = cv2.threshold(roi, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    best_area = 0.0
    best_box = None
    for c in contours:
        x, y, bw, bh = cv2.boundingRect(c)
        area = bw * bh
        if area < (w * h * 0.01) or bh < h * 0.12:
            continue
        if area > best_area:
            best_area = area
            best_box = (float(x), float(y + h * 0.25), float(x + bw), float(y + bh + h * 0.25))
    return best_box


def detect_horizontal_court_line_y(
    frame: np.ndarray,
    x: float,
    *,
    roi_top_ratio: float = 0.35,
    y_min_ratio: float = 0.4,
    y_max_ratio: float = 0.92,
    slope_max: float = 0.6,
    hough_threshold: int = 40,
) -> Optional[float]:
    """
    Estimate horizontal court line y at horizontal position x (full-frame coords).
    Hoop assumed toward top of frame; farther from hoop = larger y.
    """
    h, w = frame.shape[:2]
    court_roi = frame[int(h * roi_top_ratio) :, :]
    gray = cv2.cvtColor(court_roi, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blur, 50, 150)

    hsv = cv2.cvtColor(court_roi, cv2.COLOR_BGR2HSV)
    white_mask = cv2.inRange(hsv, np.array([0, 0, 160]), np.array([180, 70, 255]))
    combined = cv2.bitwise_and(edges, white_mask)

    lines = cv2.HoughLinesP(
        combined, 1, np.pi / 180, threshold=hough_threshold, minLineLength=int(w * 0.08), maxLineGap=12
    )
    if lines is None:
        return None

    xi = int(max(0, min(w - 1, x)))
    candidates: List[float] = []
    for line in lines:
        x1, y1, x2, y2 = [float(v) for v in line[0]]
        if abs(x2 - x1) < 8:
            continue
        slope = abs((y2 - y1) / (x2 - x1 + 1e-6))
        if slope > slope_max:
            continue
        if min(x1, x2) - 20 <= xi <= max(x1, x2) + 20:
            t = (xi - x1) / (x2 - x1 + 1e-6)
            y_at = y1 + t * (y2 - y1) + h * roi_top_ratio
            if h * y_min_ratio < y_at < h * y_max_ratio:
                candidates.append(y_at)

    if not candidates:
        return None
    return float(np.median(candidates))


def detect_arc_y_at_x(frame: np.ndarray, x: float) -> Optional[float]:
    """3pt arc — lower court band, shallow slope segments."""
    return detect_horizontal_court_line_y(
        frame, x, roi_top_ratio=0.35, y_min_ratio=0.4, y_max_ratio=0.92, slope_max=0.6
    )


def detect_ft_line_y_at_x(frame: np.ndarray, x: float) -> Optional[float]:
    """Free throw line — near baseline, strongly horizontal."""
    return detect_horizontal_court_line_y(
        frame, x, roi_top_ratio=0.45, y_min_ratio=0.55, y_max_ratio=0.9, slope_max=0.35, hough_threshold=35
    )


def detect_halfcourt_line_y_at_x(frame: np.ndarray, x: float) -> Optional[float]:
    """Half-court line — mid-court horizontal band."""
    return detect_horizontal_court_line_y(
        frame, x, roi_top_ratio=0.28, y_min_ratio=0.42, y_max_ratio=0.82, slope_max=0.45, hough_threshold=38
    )


def resolve_rule_mode(session_type: str, record_slug: Optional[str]) -> Optional[str]:
    if record_slug == "halfcourt_makes_10":
        return "halfcourt"
    if session_type == "three_point":
        return "arc"
    if session_type == "free_throw":
        return "ft_line"
    return None


def estimate_position_vs_line(
    cap: cv2.VideoCapture,
    peak: MotionPeak,
    fps: float,
    line_detector: Callable[[np.ndarray, float], Optional[float]],
    *,
    close_hoop_ratio: float = 0.42,
    far_hoop_ratio: float = 0.2,
    line_margin_ratio: float = 0.025,
) -> tuple[Optional[bool], float]:
    """
    Per-shot court line check at release frame.
    True = feet behind required line (farther from hoop). None = inconclusive.
    """
    release_frame = max(0, peak.frame_idx - int(fps * 0.15))
    cap.set(cv2.CAP_PROP_POS_FRAMES, release_frame)
    ret, frame = cap.read()
    if not ret:
        return None, 0.0

    h, w = frame.shape[:2]
    person = detect_person_bbox(frame)
    if person is None:
        return None, 0.3

    x1, y1, x2, y2 = person
    feet_x = (x1 + x2) / 2.0
    feet_y = y2
    person_h_ratio = (y2 - y1) / h

    if person_h_ratio > close_hoop_ratio:
        return False, 0.72

    line_y = line_detector(frame, feet_x)
    if line_y is not None:
        margin = h * line_margin_ratio
        if feet_y > line_y + margin:
            return True, 0.78
        if feet_y < line_y - margin:
            return False, 0.8
        return None, 0.45

    if person_h_ratio < far_hoop_ratio:
        return True, 0.52
    if person_h_ratio > close_hoop_ratio * 0.82:
        return False, 0.58
    return None, 0.35


def estimate_behind_arc(
    cap: cv2.VideoCapture, peak: MotionPeak, fps: float
) -> tuple[Optional[bool], float]:
    return estimate_position_vs_line(cap, peak, fps, detect_arc_y_at_x)


def estimate_behind_ft_line(
    cap: cv2.VideoCapture, peak: MotionPeak, fps: float
) -> tuple[Optional[bool], float]:
    return estimate_position_vs_line(
        cap, peak, fps, detect_ft_line_y_at_x, close_hoop_ratio=0.38, far_hoop_ratio=0.22
    )


def estimate_behind_halfcourt(
    cap: cv2.VideoCapture, peak: MotionPeak, fps: float
) -> tuple[Optional[bool], float]:
    return estimate_position_vs_line(
        cap,
        peak,
        fps,
        detect_halfcourt_line_y_at_x,
        close_hoop_ratio=0.32,
        far_hoop_ratio=0.14,
        line_margin_ratio=0.03,
    )


def apply_shot_qualification_rules(
    shots: List[ShotResult], results: List[str], rule_mode: str
) -> tuple[int, List[str], List[str]]:
    """Recompute qualified makes for arc / FT line / half-court rules."""
    flags: List[str] = []
    qualified_results: List[str] = []
    violations = 0
    inconclusive = 0

    violation_key = {
        "arc": "inside_arc_makes",
        "ft_line": "ft_line_violations",
        "halfcourt": "halfcourt_violations",
    }.get(rule_mode, "position_violations")

    unverified_key = {
        "arc": "arc_unverified_shots",
        "ft_line": "ft_line_unverified_shots",
        "halfcourt": "halfcourt_unverified_shots",
    }.get(rule_mode, "position_unverified_shots")

    for shot, raw in zip(shots, results):
        if raw != "make":
            qualified_results.append(raw)
            continue
        if shot.behind_arc is False:
            violations += 1
            qualified_results.append("miss")
            continue
        if shot.behind_arc is None:
            inconclusive += 1
        qualified_results.append(raw)

    if violations:
        flags.append(f"{violation_key}:{violations}")
    if inconclusive:
        flags.append(f"{unverified_key}:{inconclusive}")

    qualified_makes = sum(1 for r in qualified_results if r == "make")
    return qualified_makes, flags, qualified_results


def classify_shot_yolo(cap: cv2.VideoCapture, peak: MotionPeak, fps: float) -> tuple[str, float]:
    """Try YOLO ball/hoop detection around peak frame."""
    model = _get_yolo()
    if not model:
        return _classify_shot_heuristic(cap, peak, fps)

    start_frame = max(0, peak.frame_idx - 5)
    cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)

    make_signals = 0
    total_frames = 0

    for offset in range(20):
        ret, frame = cap.read()
        if not ret:
            break
        total_frames += 1
        results = model(frame, verbose=False, conf=0.25)
        # Look for sports ball class (COCO class 32) in upper region
        h = frame.shape[0]
        for r in results:
            for box in r.boxes:
                cls = int(box.cls[0])
                if cls == 32:  # sports ball
                    y_center = float(box.xyxy[0][1] + box.xyxy[0][3]) / 2
                    if y_center < h * 0.35:
                        make_signals += 1

    if total_frames == 0:
        return "miss", 0.4

    ratio = make_signals / total_frames
    if ratio > 0.15:
        return "make", min(0.92, 0.55 + ratio)
    return "miss", min(0.85, 0.5 + (1 - ratio) * 0.3)


def _classify_shot_heuristic(cap: cv2.VideoCapture, peak: MotionPeak, fps: float) -> tuple[str, float]:
    """Heuristic: post-peak motion settling = likely miss; sharp drop = possible make."""
    start = max(0, peak.frame_idx)
    cap.set(cv2.CAP_PROP_POS_FRAMES, start)

    post_intensities: List[float] = []
    ret, prev = cap.read()
    if not ret:
        return "miss", 0.45

    prev_gray = cv2.cvtColor(prev, cv2.COLOR_BGR2GRAY)
    for _ in range(int(fps * 1.2)):
        ret, frame = cap.read()
        if not ret:
            break
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        diff = cv2.absdiff(prev_gray, gray)
        post_intensities.append(float(np.mean(diff)))
        prev_gray = gray

    if not post_intensities:
        return "miss", 0.45

    # Makes often have a brief high-motion spike then quiet (ball through net)
    early = np.mean(post_intensities[: max(1, len(post_intensities) // 3)])
    late = np.mean(post_intensities[len(post_intensities) // 2 :])
    if early > late * 1.4:
        return "make", 0.62
    return "miss", 0.58


def sample_frame_jpegs(video_path: str, n: int = 10) -> List[str]:
    """Evenly sample JPEG frames as base64 for OpenAI vision."""
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return []

    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 1
    indices = np.linspace(0, max(total - 1, 0), min(n, total), dtype=int)
    out: List[str] = []

    for idx in indices:
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(idx))
        ret, frame = cap.read()
        if not ret:
            continue
        ok, buf = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 72])
        if not ok:
            continue
        out.append(base64.b64encode(buf.tobytes()).decode("ascii"))

    cap.release()
    return out


def _session_prompt(session_type: str) -> str:
    label = {
        "three_point": "3-pointers behind the arc",
        "free_throw": "free throws",
        "midrange": "midrange shots",
    }.get(session_type, "basketball shots")
    arc_rules = ""
    if session_type == "three_point":
        arc_rules = """
- Only count makes from behind the 3-point arc (not layups or inside-arc shots).
- Flag layups or inside-arc makes — do not include them in makes count.
- Shooter full body should be visible; sideline/baseline angle preferred."""
    elif session_type == "free_throw":
        arc_rules = """
- Shooter feet must be behind the free throw line on each attempt.
- Flag shots taken with foot on or over the line."""
    return f"""Analyze these frames from a basketball shooting video ({label}).
Count total shot attempts, makes, misses, and longest consecutive make streak.
Be conservative; if the hoop is not visible set confidence below 0.35.{arc_rules}
Return JSON only:
{{"total_shots": int, "makes": int, "misses": int, "best_streak": int, "confidence": float, "summary": "string"}}"""


def openai_vision_fallback(video_path: str, session_type: str) -> Optional[AnalyzeResponse]:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return None

    frames = sample_frame_jpegs(video_path)
    if not frames:
        return None

    model = os.environ.get("OPENAI_VISION_MODEL", "gpt-4o-mini")
    content: List[dict] = [{"type": "text", "text": _session_prompt(session_type)}]
    for b64 in frames[:8]:
        content.append(
            {
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{b64}", "detail": "low"},
            }
        )

    payload = {
        "model": model,
        "messages": [{"role": "user", "content": content}],
        "max_tokens": 700,
        "response_format": {"type": "json_object"},
    }

    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except Exception:
        return None

    text = body.get("choices", [{}])[0].get("message", {}).get("content")
    if not text:
        return None

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        return None

    makes = max(0, int(parsed.get("makes", 0)))
    misses = max(0, int(parsed.get("misses", 0)))
    total = max(0, int(parsed.get("total_shots", makes + misses)))
    if total == 0 and makes + misses > 0:
        total = makes + misses
    if total == 0 and makes == 0:
        return None

    best_streak = max(0, int(parsed.get("best_streak", 0)))
    confidence = max(0.0, min(1.0, float(parsed.get("confidence", 0.55))))

    results: List[str] = ["make"] * makes + ["miss"] * max(0, total - makes)
    shots = [
        ShotResult(
            shot_number=i + 1,
            result=r,
            confidence=round(confidence * 0.9, 3),
            timestamp_start=0,
            timestamp_end=0,
        )
        for i, r in enumerate(results)
    ]

    fg = round((makes / total * 100) if total > 0 else 0, 1)
    return AnalyzeResponse(
        total_shots=total,
        makes=makes,
        misses=max(0, total - makes),
        fg_percent=fg,
        best_streak=best_streak or compute_best_streak(results),
        confidence=round(confidence, 3),
        shots=shots,
        analysis_source="openai_vision",
    )


def is_weak_result(response: AnalyzeResponse) -> bool:
    return response.total_shots == 0 or (response.confidence < 0.45 and response.makes == 0)


def compute_best_streak(results: List[str]) -> int:
    best = 0
    current = 0
    for r in results:
        if r == "make":
            current += 1
            best = max(best, current)
        else:
            current = 0
    return best


def analyze_video(
    video_path: str, session_type: str, record_slug: Optional[str] = None
) -> AnalyzeResponse:
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError("Could not open video")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    frame_count = cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0
    video_duration_sec = round(float(frame_count / fps) if fps > 0 else 0.0, 2)

    peaks = detect_motion_peaks(cap, fps)
    rule_mode = resolve_rule_mode(session_type, record_slug)
    position_estimators = {
        "arc": estimate_behind_arc,
        "ft_line": estimate_behind_ft_line,
        "halfcourt": estimate_behind_halfcourt,
    }

    shots: List[ShotResult] = []
    results: List[str] = []

    for i, peak in enumerate(peaks):
        result, conf = classify_shot_yolo(cap, peak, fps)
        behind_arc: Optional[bool] = None
        arc_conf = 0.0
        if rule_mode:
            estimator = position_estimators.get(rule_mode, estimate_behind_arc)
            behind_arc, arc_conf = estimator(cap, peak, fps)

        results.append(result)
        shots.append(
            ShotResult(
                shot_number=i + 1,
                result=result,
                confidence=round(conf, 3),
                timestamp_start=round(max(0, peak.timestamp - 0.5), 2),
                timestamp_end=round(peak.timestamp + 1.5, 2),
                behind_arc=behind_arc,
                behind_arc_confidence=round(arc_conf, 3),
            )
        )

    cap.release()

    rule_flags: List[str] = []
    qualified_makes = sum(1 for r in results if r == "make")

    if rule_mode:
        qualified_makes, rule_mode_flags, qualified_results = apply_shot_qualification_rules(
            shots, results, rule_mode
        )
        rule_flags.extend(rule_mode_flags)
        makes = qualified_makes
    else:
        qualified_results = list(results)
        makes = qualified_makes

    total = len(results)
    misses = total - makes
    fg = round((makes / total * 100) if total > 0 else 0, 1)
    avg_conf = round(float(np.mean([s.confidence for s in shots])) if shots else 0.5, 3)

    return AnalyzeResponse(
        total_shots=total,
        makes=makes,
        misses=misses,
        fg_percent=fg,
        best_streak=compute_best_streak(qualified_results),
        confidence=avg_conf,
        shots=shots,
        analysis_source="opencv",
        qualified_makes=qualified_makes,
        video_duration_sec=video_duration_sec,
        rule_flags=rule_flags,
    )


@app.get("/health")
def health():
    yolo = _get_yolo()
    return {"ok": True, "yolo_loaded": bool(yolo)}


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(req: AnalyzeRequest):
    if not req.video_url:
        raise HTTPException(status_code=400, detail="video_url required")

    path: Optional[str] = None
    try:
        path = download_video(req.video_url)
        result = analyze_video(path, req.session_type, req.record_slug)
        if is_weak_result(result):
            ai = openai_vision_fallback(path, req.session_type)
            if ai is not None:
                return ai
        return result
    except Exception as e:
        if path and os.path.exists(path):
            ai = openai_vision_fallback(path, req.session_type)
            if ai is not None:
                return ai
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if path and os.path.exists(path):
            os.remove(path)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
