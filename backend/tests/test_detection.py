"""
모니터링 로직 단위 테스트.
"""

import math

from app.websocket.manager import SessionState
from app.services import detection


def make_monitoring_state(baseline=0.15, std=0.03) -> SessionState:
    """모니터링 모드의 SessionState 생성"""
    state = SessionState(session_id="test", websocket=None)  # type: ignore
    state.mode = "monitoring"
    state.baseline_delta_depth = baseline
    state.baseline_std = std
    state.ema_value = baseline
    state.is_turtle_active = False
    return state


def test_ema_smoothing_reduces_spike():
    """단발성 스파이크가 EMA에 의해 완화되는지"""
    state = make_monitoring_state()
    
    # 정상 값 → 스파이크 → 정상 값
    detection.detect(state, 0.15)
    detection.detect(state, 0.50)  # 스파이크
    detection.detect(state, 0.15)
    
    # EMA가 0.50까지 안 올라감 (α=0.3 기준)
    assert state.ema_value < 0.30


def test_hysteresis_prevents_flapping():
    """임계값 근처에서 깜빡이지 않는지"""
    state = make_monitoring_state(baseline=0.15, std=0.03)
    # threshold_low = 0.18, threshold_high = 0.21
    
    # 거북목 진입 (high 초과)
    for _ in range(10):
        detection.detect(state, 0.40)
    assert state.is_turtle_active is True
    
    # 회색 지대(0.19) 값을 줘도 거북목 유지
    for _ in range(10):
        detection.detect(state, 0.19)
    assert state.is_turtle_active is True
    
    # low 아래로 명확히 떨어지면 정상 복귀
    for _ in range(10):
        detection.detect(state, 0.10)
    assert state.is_turtle_active is False


def test_detect_returns_none_in_wrong_mode():
    state = SessionState(session_id="test", websocket=None)  # type: ignore
    state.mode = "idle"
    
    result = detection.detect(state, 0.40)
    assert result is None


def test_detect_ignores_nan_depth():
    state = make_monitoring_state()
    result = detection.detect(state, math.nan)
    assert result is None
    assert state.ema_value == 0.15


def test_update_ema_formula():
    """EMA 공식 정확성"""
    # α=0.3, prev=0.10, current=0.20
    # new = 0.3*0.20 + 0.7*0.10 = 0.13
    result = detection.update_ema(previous=0.10, current=0.20, alpha=0.3)
    assert abs(result - 0.13) < 1e-9


if __name__ == "__main__":
    test_ema_smoothing_reduces_spike()
    test_hysteresis_prevents_flapping()
    test_detect_returns_none_in_wrong_mode()
    test_detect_ignores_nan_depth()
    test_update_ema_formula()
    print("All tests passed")
