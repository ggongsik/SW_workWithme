import time
import math
import numpy as np

from dataclasses import dataclass
from typing import Optional


from app.websocket.manager import SessionState
from app.services import personalization


# ===== 상수 =====
# 30프레임은 안정적인 기준값을 위한 목표치다.
# 실제 웹 세션에서는 AI 처리 지연으로 10초 안에 30개를 못 채울 수 있어 임시 최소치를 낮춘다.
TARGET_SAMPLES = 30
MIN_SAMPLES_REQUIRED = 30
THRESHOLD_SIGMA = 2.0  # threshold는 표시·참고용. 실제 거북목 판정은 IF가 담당.

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
    if not math.isfinite(delta_depth):
        return

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
    arr = arr[np.isfinite(arr)]
    if (len(arr) < MIN_SAMPLES_REQUIRED):
        return None

    baseline = float(np.mean(arr))
    std = float(np.std(arr, ddof=1))  # 표본 표준편차
    threshold = baseline + THRESHOLD_SIGMA * std  # 표시·참고용 (검출엔 미사용)
    duration = time.time() - state.calibration_started_at

    # 캘리브레이션 데이터로 개인화 IF 모델 학습 (매 캘리브레이션마다 새로 생성)
    model = personalization.train_model(arr.tolist())
    if model is None:
        return None

    # 세션 상태 업데이트
    state.mode = "monitoring"
    state.baseline_delta_depth = baseline
    state.baseline_std = std
    state.threshold = threshold
    state.posture_model = model
    state.ema_value = baseline

    ####
    return CalibrationResult(
        baseline = baseline,
        std = std,
        threshold = threshold,
        sample_count = len(arr),
        duration_sec = duration
    )






