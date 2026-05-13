"""
Mock이 Protocol을 제대로 따르는지 자동 검증.
나중에 RealPipeline 추가될 때도 같은 검증을 받게 됨.
"""

import numpy as np
from app.services.ai_pipeline import (
    PoseResult, PosturePipeline, MockPosturePipeline)

def test_mock_satisfies_protocol():
    """MockPosturePipeline이 PosturePipeline 프로토콜을 만족하는지"""
    mock: PosturePipeline = MockPosturePipeline()

    assert hasattr(mock, "process_frame") # mock 객체에 process_frame이 있는지
    assert callable(mock.process_frame) # 변수가 아니라 호출 가능한 함수인지

def test_mock_returns_correct_shape():
    """반환값이 PoseResult 스키마를 만족하는지"""
    mock = MockPosturePipeline()
    fake_frame = np.zeros((480,640,3), dtype = np.uint8)

    result = mock.process_frame(fake_frame)

    assert "delta_depth" in result
    assert "nose_depth" in result
    assert "shoulder_depth" in result
    assert "detected" in result
    assert "confidence" in result
    
    assert isinstance(result["delta_depth"], float)
    assert isinstance(result["detected"], bool)
    assert 0.0 <= result["confidence"] <= 1.0

def test_mock_simulates_posture_change():
    """Mock이 시간에 따라 자세를 바꾸는지 (캘리브레이션 시나리오 검증)"""
    import time
    
    mock = MockPosturePipeline()
    fake_frame = np.zeros((480, 640, 3), dtype=np.uint8)
    
    # 처음 1초 동안 측정 → 바른 자세 영역
    early_results = [mock.process_frame(fake_frame) for _ in range(5)]
    early_avg = sum(r["delta_depth"] for r in early_results) / len(early_results)
    
    # 0.15 근처여야 함 (노이즈 고려해 ±0.1)
    assert 0.05 < early_avg < 0.25, f"바른 자세 영역 벗어남: {early_avg}"

if __name__=="__main__":
    test_mock_satisfies_protocol()
    test_mock_returns_correct_shape()
    test_mock_simulates_posture_change()
    print("모든 테스트 통과")