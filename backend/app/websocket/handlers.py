## 질문 : async/await  붙이는 기준
import asyncio
import os
import sys
import time
import json
import io

import numpy as np
from PIL import Image

# 서버용 websocket
from fastapi import WebSocket, WebSocketDisconnect

from app.websocket.manager import manager, SessionState, PostureEvent
from app.services import calibration, detection
from app.services.persistence import save_session_and_accumulate


from app.models.schemas import (
    SessionStarted,
    ErrorMessage,
    CalibrationComplete,
    DetectionResult as DetectionResultMsg,
    SessionEnded
)

# AI 파이프라인 선택: True면 Mock, False면 실제 AI(MediaPipe + Depth Anything v2)
USE_MOCK_PIPELINE = False

if USE_MOCK_PIPELINE:
    from app.services.ai_pipeline import MockPosturePipeline
    _ai_pipeline = MockPosturePipeline()
else:
    # ai/ 폴더와 Depth-Anything-V2 라이브러리 경로 등록
    # 주의: insert(0, ...) 대신 append 사용. Depth-Anything-V2/app.py가
    # backend의 app/ 패키지보다 먼저 매칭되는 것을 방지.
    """
    이 부분 논의가 필요하다.
    """
    _AI_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "ai"))
    sys.path.append(_AI_DIR)
    sys.path.append(os.path.join(_AI_DIR, "Depth-Anything-V2"))
    from pipeline import PosturePipeline  # type: ignore

    _MODEL_PATH = os.path.join(_AI_DIR, "models", "depth_anything_v2_vits.pth")
    _ai_pipeline = PosturePipeline(model_path=_MODEL_PATH)

# Pydantic 모델(객체)을 JSON으로 전송
# model_dump() : Dict로 변환
async def send_json(websocket: WebSocket, model) -> None:
    await websocket.send_json(model.model_dump())

async def send_error(websocket: WebSocket, code: str, message: str) -> None:
    await send_json(websocket, ErrorMessage(
        code = code,
        message = message
    ))

def decode_frame(frame_bytes: bytes) -> np.ndarray | None:
    try:
        img = Image.open(io.BytesIO(frame_bytes))
        rgb = np.array(img)
        bgr = rgb[:, :, ::-1].copy()
        return bgr
    except Exception as e:
        print(f"[decode_frame] 실패: {e}")
        return None

# 연결 수락 → 메시지 루프 → 연결 정리 의 전체 생명주기를 관리.
async def handle_posture_connection(websocket: WebSocket, user_id: str | None = None) -> None:

    # 1. 연결 수락 및 세션 생성
    state: SessionState = await manager.connect(websocket, user_id = user_id)

    # 2. 세션 시작 알림
    await send_json(websocket, SessionStarted(
        session_id = state.session_id,
        timestamp = time.time()
    ))

    try:
        # 3. 메시지 수신 루프
        while True:
            message = await websocket.receive() # receive()에서 양보하는 동안 다른 사용자의 WebSocket 연결도 동시에 처리

            if message["type"] == "websocket.disconnect":
                break

            # JSON 인지 binary인지 구분
            if "text" in message:
                await _handle_text_message(state, message["text"]) # async 함수는 무조건 await로 호출
            elif "bytes" in message:
                # 프레임 데이터 (Step 7에서 구현)
                await _handle_frame(state, message["bytes"])

    except WebSocketDisconnect:
        pass  # 정상적인 연결 끊김은 무시

    finally:
        # 4. 연결 정리 (예외 발생해도 반드시 실행)
        manager.disconnect(state.session_id)
        # session_ended는 이미 연결이 끊긴 뒤라 못 보냄.
        # 정상 종료는 stop_session 메시지로 처리

## send_json() == async 함수
async def _handle_text_message(state: SessionState, raw_text: str) -> None:
    """
    클라이언트가 보낸 JSON 메시지 처리.
    지금은 받았다는 것만 확인. 실제 로직은 Step 7~8에서.
    """
    try:
        data = json.loads(raw_text) # JSON 문자열을 딕셔너리로 변환
    except json.JSONDecodeError:
        await send_error(
            state.websocket,
            code = "INVALID_JSON",
            message = "메시지가 유효한 JSON이 아닙니다"
        )
        return

    msg_type = data.get("type")

    if msg_type == "start_calibration" :
        await _start_calibration(state)
    elif msg_type == "stop_calibration" :
        await _stop_calibration(state)
    elif msg_type == "start_monitoring" :
        await _start_monitoring(state)
    elif msg_type == "stop_session" :
        await _stop_session(state)
    else:
        await send_error(
            state.websocket,
            code = "UNKNOWN_MESSAGE_TYPE",
            message = f"알 수 없는 메시지 타입: {msg_type}"
        )

async def _start_calibration(state: SessionState) -> None:
    if state.mode == "calibrating":
        await send_error(
                state.websocket,
                code = "ALREADY_CALIBRATING",
                message = "이미 캘리브레이션 진행 중입니다"
            )
        return
    if state.mode == "monitoring":
        # 재캘리브레이션은 허용. 로그만 남김.
        print(f"[{state.session_id[:8]}] 재캘리브레이션 요청")
        state.is_turtle_active = False
        state.ema_value = None


    calibration.start_calibration(state)
    print(f"[{state.session_id[:8]}] 캘리브레이션 시작")

async def _stop_calibration(state: SessionState) -> None:
    """
    프론트엔드가 10초 타이머 종료 후 보내는 메시지 처리.
    캘리브레이션을 마무리하고 monitoring 모드로 전환.
    """
    if state.mode != "calibrating":
        await send_error(
            state.websocket,
            code = "NOT_CALIBRATING",
            message = "캘리브레이션 상태가 아닙니다"
        )
        return

    result = calibration.finalize_calibration(state)

    # 샘플 부족 처리: 현재는 A안 (에러 + idle 복귀). 추후 상의 후 변경 가능.
    if result is None:
        await send_error(
            state.websocket,
            code = "INSUFFICIENT_SAMPLES",
            message = f"수집된 샘플이 부족합니다 (최소 {calibration.MIN_SAMPLES_REQUIRED}개 필요)"
        )
        state.mode = "idle"
        return

    await send_json(state.websocket, CalibrationComplete(
        baseline_delta_depth = round(result.baseline, 4),
        baseline_std = round(result.std, 4),
        threshold = round(result.threshold, 4)
    ))
    # 캘리브레이션 완료 시점을 첫 이벤트로 기록 (정상 상태 시작점)
    state.posture_events.append(PostureEvent(
        timestamp=time.time(),
        is_turtle=False,
        delta_depth_smoothed=result.baseline,
    ))
    print(f"[{state.session_id[:8]}] 캘리브레이션 완료: "
          f"baseline={result.baseline:.4f}, threshold={result.threshold:.4f}")

async def _start_monitoring(state: SessionState) -> None:
    """
    프론트 '자세 교정 시작' 시 호출. 순수 모니터링 시간 측정 시작점.
    캘리브레이션이 끝나(monitoring 모드) 있어야 한다.
    """
    if state.mode != "monitoring":
        await send_error(
            state.websocket,
            code = "NOT_CALIBRATED",
            message = "캘리브레이션을 먼저 완료해주세요"
        )
        return
    state.monitoring_started_at = time.time()
    print(f"[{state.session_id[:8]}] 모니터링 시작 (시간 측정 개시)")

async def _handle_frame(state: SessionState, frame_bytes: bytes) -> None:
    """
    프레임 바이트 처리.
    """
    if state.mode == "idle":
        await send_error(
            state.websocket,
            code = "NOT CALIBRATED",
            message = "캘리브레이션을 먼저 시작해주세요 (start_calibration)"
        )
        return

    frame = decode_frame(frame_bytes)
    if frame is None:
        await send_error(
            state.websocket,
            code = "INVALID_FRAME",
            message = "프레임 디코딩 실패"
        )
        return

    # 2. AI 파이프라인 호출 ← 여기가 가장 중요!
    # 동기 함수를 별도 쓰레드에서 실행하여 sleep 부분에서 cpu를 이벤트 루프에 양보
    loop = asyncio.get_running_loop() # 이벤트 루프 객체
    result = await loop.run_in_executor(
        None,
        _ai_pipeline.process_frame,
        frame
    )

    # [임시 진단] AI 처리 시간 / 감지 결과 로그
    print(f"[AI] processing_time={result.get('processing_time_ms', 0):.0f}ms, "
          f"detected={result['detected']}, delta={result.get('delta_depth', 0):.4f}, "
          f"mode={state.mode}")

    if not result["detected"]:
        """
        사용자가 자리를 비울 때
        """
        return

    if state.mode == "calibrating":
        await _process_calibration_frame(state, result['delta_depth'])
    elif state.mode == "monitoring":
        await _process_monitoring_frame(state, result["delta_depth"])


async def _process_calibration_frame(state: SessionState, delta_depth: float) -> None:
    """
    캘리브레이션 모드의 프레임 처리 - 샘플 누적만 담당.

    프론트엔드가 10초 타이머를 관리하고, 종료 시점에 stop_calibration 메시지를
    보내면 그때 finalize_calibration이 호출됨 (_stop_calibration 참조).
    """
    calibration.add_sample(state, delta_depth)

async def _process_monitoring_frame(state: SessionState, delta_depth: float) -> None:
    """모니터링 모드의 프레임 처리"""
    prev_state = state.is_turtle_active

    result = detection.detect(state, delta_depth)
    if result is None:
        return  # 안전망 (이론상 도달하지 않음)

    # 1. 매 프레임 결과를 클라이언트에 전송
    await send_json(state.websocket, DetectionResultMsg(
        is_turtle = result.is_turtle,
        delta_depth = round(result.delta_depth, 4),
        delta_depth_smoothed = round(result.delta_depth_smoothed, 4),
        baseline = round(result.baseline, 4),
        threshold = round(result.threshold_high, 4),
        timestamp = result.timestamp
    ))

    if (prev_state != result.is_turtle):
        state.posture_events.append(PostureEvent(
            timestamp = result.timestamp,
            is_turtle = result.is_turtle,
            delta_depth_smoothed = result.delta_depth_smoothed
        ))
        transition = "거북목 진입" if result.is_turtle else "정상 자세 복귀"
        print(f"[{state.session_id[:8]}] {transition} "
              f"(ema={result.delta_depth_smoothed:.4f})")

async def _stop_session(state: SessionState) -> None:
    """세션 종료 처리: 모니터링 시간 계산 + 저장(DailyStats 누적) + ack."""
    session_ended_at = time.time()

    # 거북목 상태로 끝났다면 가상의 정상 복귀 이벤트 추가
    # (build_intervals가 마지막 구간의 끝점을 잡도록)
    if state.is_turtle_active:
        state.posture_events.append(PostureEvent(
            timestamp = session_ended_at,
            is_turtle = False,
            delta_depth_smoothed = state.ema_value or 0.0
        ))

    # 순수 모니터링 시간 (start_monitoring ~ stop_session)
    if state.monitoring_started_at is not None:
        monitoring_duration = session_ended_at - state.monitoring_started_at
    else:
        monitoring_duration = 0.0

    # 모니터링을 시작하지 않았으면 저장 스킵 (캘리브레이션만 하고 종료 등)
    if state.mode != "monitoring" or monitoring_duration <= 0:
        await send_json(state.websocket, SessionEnded(session_id = state.session_id))
        state.monitoring_started_at = None
        return

    try:
        await save_session_and_accumulate(state, session_ended_at, monitoring_duration)
    except Exception as e:
        print(f"[{state.session_id[:8]}] 저장 실패: {e}")
        await send_error(
            state.websocket,
            code = "SAVE_FAILED",
            message = "세션 저장에 실패했습니다"
        )
        return

    await send_json(state.websocket, SessionEnded(session_id = state.session_id))
    state.monitoring_started_at = None  # 다음 모니터링(재캘리브레이션 등) 대비 리셋
    print(f"[{state.session_id[:8]}] 세션 저장 완료 (모니터링 {monitoring_duration:.1f}초)")
