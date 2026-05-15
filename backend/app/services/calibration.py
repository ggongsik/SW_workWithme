import time
import numpy as np

from dataclasses import dataclass
from typing import Optional


from app.websocket.manager import SessionState


# ===== 상수 =====
# 프론트가 10초 타이머를 관리. 백엔드는 시간 추적 안 함.
MIN_SAMPLES_REQUIRED = 30  # 최소 30프레임 (3FPS 기준 10초), 얼마나 받을지는 상의 필요
THRESHOLD_SIGMA = 2.0

# ===== 캘리브레이션 결과 =====
@dataclass
class CalibrationResult:
    baseline: float
    std: float
    threshold: float
    sample_count: int
    duration_sec: float

def start_calibration(state: SessionState) -> None:
    state.mode = "calibrating"
    state.calibration_started_at = time.time()
    state.calibration_samples = [] # 재캘리브레이션일 경우 초기화

def add_sample(state: SessionState, delta_depth: float) -> None:
    """
    프레임 한 장 처리: delta_depth를 누적.

    캘리브레이션이 아닌 상태에서 호출되면 ValueError.
    """
    if (state.mode != "calibrating") or (state.calibration_started_at is None):
        raise ValueError("캘리브레이션 상태가 아닙니다")

    state.calibration_samples.append(delta_depth)

def finalize_calibration(state: SessionState) -> Optional[CalibrationResult]:
    """
    캘리브레이션 마무리: 통계 계산 + 상태를 monitoring으로.
    
    샘플이 부족하면 None 반환 (호출자가 에러 처리).
    """
    if (state.mode != "calibrating") or (state.calibration_started_at is None):
        return None
    
    samples = state.calibration_samples
    if (len(samples) < MIN_SAMPLES_REQUIRED):
        return None

    arr = np.array(samples, dtype=np.float64)
    baseline = float(np.mean(arr))
    std = float(np.std(arr, ddof=1))  # 표본 표준편차
    threshold = baseline + THRESHOLD_SIGMA * std
    duration = time.time() - state.calibration_started_at

    # 세션 상태 업데이트
    state.mode = "monitoring"
    state.baseline_delta_depth = baseline
    state.baseline_std = std
    state.threshold = threshold
    state.ema_value = baseline

    ####
    return CalibrationResult(
        baseline = baseline,
        std = std,
        threshold = threshold,
        sample_count = len(samples),
        duration_sec = duration
    )





    
