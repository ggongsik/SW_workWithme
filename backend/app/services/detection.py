"""
실시간 거북목 감지 로직.

- EMA 스무딩으로 노이즈 완화
- 개인화 Isolation Forest 모델로 거북목(이상치) 판정 (기존 임계값/히스테리시스 방식 폐기)
- 결과는 SessionState에 누적 (DB 저장에 사용)
"""
import time
import math

from typing import Optional
from dataclasses import dataclass

from app.websocket.manager import SessionState
from app.services import personalization

EMA_ALPHA = 0.3                    # EMA 가중치 (0~1, 클수록 빠른 반응)

@dataclass
class DetectionResult:
    is_turtle: bool
    delta_depth: float
    delta_depth_smoothed: float
    baseline: float
    threshold_low: float   # 표시·참고용 (검출엔 미사용)
    threshold_high: float  # 표시·참고용 (검출엔 미사용)
    timestamp: float

""" AI 파이프라인이 자체적으로 EMA를 한다면 빼는 거 고려"""
def update_ema(previous: float, current: float, alpha: float = EMA_ALPHA) -> float:
    return alpha*current + (1.0-alpha)*previous

def detect(state: SessionState, raw_delta_depth: float) -> Optional[DetectionResult]:
    """
    한 프레임의 raw ΔDepth를 받아 거북목 여부를 판정.

    monitoring 모드가 아니거나 baseline/모델이 없으면 None.
    """
    if state.mode != "monitoring":
        return None
    if state.baseline_delta_depth is None or state.baseline_std is None:
        return None
    if state.posture_model is None:
        return None
    if not math.isfinite(raw_delta_depth):
        return None

    baseline = state.baseline_delta_depth
    std = state.baseline_std
    if not math.isfinite(baseline) or not math.isfinite(std):
        return None

    # 1. EMA 갱신
    prev_ema = state.ema_value if state.ema_value is not None else baseline
    new_ema = update_ema(prev_ema, raw_delta_depth)
    state.ema_value = new_ema

    # 2. 개인화 IF 모델로 거북목 판정 (EMA 스무딩된 값을 입력)
    is_turtle = personalization.is_turtle(state.posture_model, new_ema)
    state.is_turtle_active = is_turtle

    # threshold 값은 표시·참고용으로만 계산해서 메시지에 실어보냄
    threshold_ref = state.threshold if state.threshold is not None else baseline

    return DetectionResult(
        is_turtle = is_turtle,
        delta_depth = raw_delta_depth,
        delta_depth_smoothed = new_ema,
        baseline = baseline,
        threshold_low = baseline,
        threshold_high = threshold_ref,
        timestamp = time.time()
    )
