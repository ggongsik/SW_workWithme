"""
캘리브레이션 로직 단위 테스트.
WebSocket이나 AI 파이프라인 없이 순수 로직만 검증.
"""

import math

from app.websocket.manager import SessionState
from app.services import calibration


def make_test_state() -> SessionState:
    """테스트용 가짜 SessionState"""
    return SessionState(
        session_id="test-session",
        websocket=None,  # type: ignore  (실제로 안 쓰는 테스트)
    )


def test_start_calibration_sets_mode():
    state = make_test_state()
    calibration.start_calibration(state)
    assert state.mode == "calibrating"
    assert state.calibration_started_at is not None
    assert state.calibration_samples == []


def test_add_sample_accumulates():
    state = make_test_state()
    calibration.start_calibration(state)

    calibration.add_sample(state, 0.15)
    assert len(state.calibration_samples) == 1

    calibration.add_sample(state, 0.16)
    assert len(state.calibration_samples) == 2


def test_finalize_computes_correct_stats():
    state = make_test_state()
    calibration.start_calibration(state)

    # 평균 0.15, std는 numpy 기준
    samples = [0.10, 0.12, 0.15, 0.18, 0.20] * 10  # 50개
    for s in samples:
        calibration.add_sample(state, s)

    result = calibration.finalize_calibration(state)
    assert result is not None
    assert abs(result.baseline - 0.15) < 0.01
    assert state.mode == "monitoring"
    assert state.threshold == result.threshold


def test_finalize_fails_with_few_samples():
    state = make_test_state()
    calibration.start_calibration(state)

    # 5개만 → 최소 30 미달
    for _ in range(5):
        calibration.add_sample(state, 0.15)

    result = calibration.finalize_calibration(state)
    assert result is None  # 실패


def test_nan_samples_are_ignored():
    state = make_test_state()
    calibration.start_calibration(state)

    calibration.add_sample(state, math.nan)
    assert state.calibration_samples == []

    for _ in range(calibration.MIN_SAMPLES_REQUIRED):
        calibration.add_sample(state, 0.15)

    result = calibration.finalize_calibration(state)
    assert result is not None
    assert result.sample_count == calibration.MIN_SAMPLES_REQUIRED


def test_add_sample_in_wrong_mode_raises():
    state = make_test_state()
    # mode == 'idle'
    try:
        calibration.add_sample(state, 0.15)
        assert False, "ValueError가 발생해야 함"
    except ValueError:
        pass


if __name__ == "__main__":
    test_start_calibration_sets_mode()
    test_add_sample_accumulates()
    test_finalize_computes_correct_stats()
    test_finalize_fails_with_few_samples()
    test_nan_samples_are_ignored()
    test_add_sample_in_wrong_mode_raises()
    print("All tests passed")
