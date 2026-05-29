"""
실시간 거북목 감지 로직.

- EMA 스무딩으로 노이즈 완화
- 히스테리시스로 임계값 근처 떨림 방지
- 결과는 SessionState에 누적 (Step 9에서 DB로 저장)
"""
import time

from typing import Optional
from dataclasses import dataclass

from app.websocket.manager import SessionState

"""모두 임의 값 (수정 필요) - ex) 알림이 너무 자주 뜨면 HIGH_SIGMA 올려"""
EMA_ALPHA = 0.3                    # EMA 가중치 (0~1, 클수록 빠른 반응)
HYSTERESIS_LOW_SIGMA = 1.0         # 정상 복귀 임계값: baseline + 1σ
HYSTERESIS_HIGH_SIGMA = 2.0        # 거북목 진입 임계값: baseline + 2σ
                                   # (이 값은 calibration.THRESHOLD_SIGMA와 일치해야 함)

@dataclass
class DetectionResult:
    is_turtle: bool
    delta_depth: float
    delta_depth_smoothed: float
    baseline: float
    threshold_low: float
    threshold_high: float
    timestamp: float

""" AI 파이프라인이 자체적으로 EMA를 한다면 빼는 거 고려"""
def update_ema(previous: float, current: float, alpha: float = EMA_ALPHA) -> float:
    return alpha*current + (1.0-alpha)*previous

def detect(state: SessionState, raw_delta_depth: float) -> Optional[DetectionResult]:
    """
    한 프레임의 raw ΔDepth를 받아 거북목 여부를 판정.

    monitoring 모드가 아니거나 baseline이 없으면 None.
    """
    if state.mode != "monitoring":
        return None
    if state.baseline_delta_depth is None or state.baseline_std is None:
        return None

    baseline = state.baseline_delta_depth
    std = state.baseline_std

    # 1. EMA 갱신
    prev_ema = state.ema_value if state.ema_value is not None else baseline
    new_ema = update_ema(prev_ema, raw_delta_depth)
    state.ema_value = new_ema

    # 2. 히스테리시스 임계값 계산
    # threshold = baseline + THRESHOLD_SIGMA * std
    threshold_low = baseline + HYSTERESIS_LOW_SIGMA* std
    threshold_high = baseline + HYSTERESIS_HIGH_SIGMA* std

    is_turtle = state.is_turtle_active

    # 이 수치로 충분히 판단이 될까? 뭔가 너무 빡빡한 느낌
    if (new_ema > threshold_high):
        is_turtle = True
    elif (new_ema < threshold_low):
        is_turtle = False

    state.is_turtle_active = is_turtle

    return DetectionResult(
        is_turtle = is_turtle,
        delta_depth = raw_delta_depth,
        delta_depth_smoothed = new_ema,
        baseline = baseline,
        threshold_low = threshold_low,
        threshold_high = threshold_high,
        timestamp = time.time()
    )