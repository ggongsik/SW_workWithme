import asyncio
import io
import json
import os
import sys
import time

import numpy as np
from fastapi import WebSocket, WebSocketDisconnect
from PIL import Image

from app.models.schemas import (
    CalibrationComplete,
    DetectionResult as DetectionResultMsg,
    ErrorMessage,
    SessionEnded,
    SessionStarted,
)
from app.services import calibration, detection
from app.services.persistence import save_session_with_report
from app.websocket.manager import PostureEvent, SessionState, manager


_ai_pipeline = None
_pipeline_lock = asyncio.Lock()


def get_ai_pipeline():
    """Build the AI pipeline lazily and fall back to mock when local model files are absent."""

    global _ai_pipeline
    if _ai_pipeline is not None:
        return _ai_pipeline

    mode = os.getenv("POSTURE_PIPELINE", "auto").strip().lower()
    strict_real = os.getenv("POSTURE_PIPELINE_STRICT", "0") == "1"

    if mode in {"auto", "real", "ai", "depth"}:
        try:
            ai_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "ai"))
            depth_dir = os.path.join(ai_dir, "Depth-Anything-V2")
            model_path = os.getenv(
                "POSTURE_MODEL_PATH",
                os.path.join(ai_dir, "models", "depth_anything_v2_vits.pth"),
            )
            if not os.path.exists(depth_dir):
                raise FileNotFoundError(f"Depth-Anything-V2 directory not found: {depth_dir}")
            if not os.path.exists(model_path):
                raise FileNotFoundError(f"Depth model not found: {model_path}")

            sys.path.append(ai_dir)
            sys.path.append(depth_dir)
            from pipeline import PosturePipeline  # type: ignore

            _ai_pipeline = PosturePipeline(model_path=model_path)
            return _ai_pipeline
        except Exception as exc:
            if strict_real:
                raise
            print(f"[pipeline] real pipeline unavailable, using mock: {exc}")

    from app.services.ai_pipeline import MockPosturePipeline

    _ai_pipeline = MockPosturePipeline()
    return _ai_pipeline


async def send_json(websocket: WebSocket, model) -> None:
    payload = model.model_dump() if hasattr(model, "model_dump") else model.dict()
    await websocket.send_json(payload)


async def send_error(websocket: WebSocket, code: str, message: str) -> None:
    await send_json(websocket, ErrorMessage(code=code, message=message))


def decode_frame(frame_bytes: bytes) -> np.ndarray | None:
    try:
        img = Image.open(io.BytesIO(frame_bytes)).convert("RGB")
        rgb = np.array(img)
        return rgb[:, :, ::-1].copy()
    except Exception as exc:
        print(f"[decode_frame] failed: {exc}")
        return None


async def handle_posture_connection(websocket: WebSocket) -> None:
    state: SessionState = await manager.connect(websocket)

    await send_json(websocket, SessionStarted(
        session_id=state.session_id,
        timestamp=time.time(),
    ))

    try:
        while True:
            message = await websocket.receive()

            if message["type"] == "websocket.disconnect":
                break

            if "text" in message:
                await _handle_text_message(state, message["text"])
            elif "bytes" in message:
                await _handle_frame(state, message["bytes"])

    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(state.session_id)


async def _handle_text_message(state: SessionState, raw_text: str) -> None:
    try:
        data = json.loads(raw_text)
    except json.JSONDecodeError:
        await send_error(state.websocket, "INVALID_JSON", "메시지가 유효한 JSON이 아닙니다")
        return

    msg_type = data.get("type")

    if msg_type == "start_calibration":
        await _start_calibration(state)
    elif msg_type == "stop_calibration":
        await _stop_calibration(state)
    elif msg_type == "stop_session":
        await _stop_session(state)
    else:
        await send_error(state.websocket, "UNKNOWN_MESSAGE_TYPE", f"알 수 없는 메시지 타입: {msg_type}")


async def _start_calibration(state: SessionState) -> None:
    if state.mode == "calibrating":
        await send_error(state.websocket, "ALREADY_CALIBRATING", "이미 캘리브레이션 진행 중입니다")
        return

    if state.mode == "monitoring":
        state.is_turtle_active = False
        state.ema_value = None

    calibration.start_calibration(state)
    print(f"[{state.session_id[:8]}] calibration started")


async def _stop_calibration(state: SessionState) -> None:
    if state.mode != "calibrating":
        await send_error(state.websocket, "NOT_CALIBRATING", "캘리브레이션 상태가 아닙니다")
        return

    result = calibration.finalize_calibration(state)
    if result is None:
        await send_error(
            state.websocket,
            "INSUFFICIENT_SAMPLES",
            f"수집된 샘플이 부족합니다 (최소 {calibration.MIN_SAMPLES_REQUIRED}개 필요)",
        )
        state.mode = "idle"
        return

    await send_json(state.websocket, CalibrationComplete(
        baseline_delta_depth=round(result.baseline, 4),
        baseline_std=round(result.std, 4),
        threshold=round(result.threshold, 4),
    ))
    state.posture_events.append(PostureEvent(
        timestamp=time.time(),
        is_turtle=False,
        delta_depth_smoothed=result.baseline,
    ))
    print(
        f"[{state.session_id[:8]}] calibration complete: "
        f"baseline={result.baseline:.4f}, threshold={result.threshold:.4f}"
    )


async def _handle_frame(state: SessionState, frame_bytes: bytes) -> None:
    if state.mode == "idle":
        await send_error(state.websocket, "NOT_CALIBRATED", "캘리브레이션을 먼저 시작해주세요")
        return

    frame = decode_frame(frame_bytes)
    if frame is None:
        await send_error(state.websocket, "INVALID_FRAME", "프레임 디코딩 실패")
        return

    loop = asyncio.get_running_loop()
    pipeline = get_ai_pipeline()
    async with _pipeline_lock:
        result = await loop.run_in_executor(None, pipeline.process_frame, frame)

    print(
        f"[AI] processing_time={result.get('processing_time_ms', 0):.0f}ms, "
        f"detected={result['detected']}, delta={result.get('delta_depth', 0):.4f}, "
        f"mode={state.mode}"
    )

    if not result["detected"]:
        return

    if state.mode == "calibrating":
        await _process_calibration_frame(state, result["delta_depth"])
    elif state.mode == "monitoring":
        await _process_monitoring_frame(state, result["delta_depth"])


async def _process_calibration_frame(state: SessionState, delta_depth: float) -> None:
    calibration.add_sample(state, delta_depth)


async def _process_monitoring_frame(state: SessionState, delta_depth: float) -> None:
    prev_state = state.is_turtle_active
    result = detection.detect(state, delta_depth)
    if result is None:
        return

    await send_json(state.websocket, DetectionResultMsg(
        is_turtle=result.is_turtle,
        delta_depth=round(result.delta_depth, 4),
        delta_depth_smoothed=round(result.delta_depth_smoothed, 4),
        baseline=round(result.baseline, 4),
        threshold=round(result.threshold_high, 4),
        timestamp=result.timestamp,
    ))

    if prev_state != result.is_turtle:
        state.posture_events.append(PostureEvent(
            timestamp=result.timestamp,
            is_turtle=result.is_turtle,
            delta_depth_smoothed=result.delta_depth_smoothed,
        ))
        transition = "turtle_enter" if result.is_turtle else "turtle_exit"
        print(f"[{state.session_id[:8]}] {transition} (ema={result.delta_depth_smoothed:.4f})")


async def _stop_session(state: SessionState) -> None:
    session_ended_at = time.time()

    if state.is_turtle_active:
        state.posture_events.append(PostureEvent(
            timestamp=session_ended_at,
            is_turtle=False,
            delta_depth_smoothed=state.ema_value or 0.0,
        ))

    if state.mode in ("idle", "calibrating"):
        await send_json(state.websocket, SessionEnded(
            session_id=state.session_id,
            report_id=None,
            duration_sec=session_ended_at - state.started_at,
        ))
        state.mode = "idle"
        return

    try:
        report_id = await save_session_with_report(state, session_ended_at)
    except Exception as exc:
        print(f"[{state.session_id[:8]}] save failed: {exc}")
        await send_error(state.websocket, "SAVE_FAILED", "세션 저장에 실패했습니다")
        return

    state.mode = "idle"
    await send_json(state.websocket, SessionEnded(
        session_id=state.session_id,
        report_id=report_id,
        duration_sec=session_ended_at - state.started_at,
    ))

    print(f"[{state.session_id[:8]}] session saved (report_id={report_id[:8]}...)")
