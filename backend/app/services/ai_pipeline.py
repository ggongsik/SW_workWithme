"""
AI 파이프라인 인터페이스 정의 + Mock 구현.

실제 AI 파이프라인(이설 담당)이 완성되기 전까지 이 Mock으로 백엔드 개발 진행.
통합 시점에 RealPipeline import만 추가하면 됨.
"""

import random
import time
from typing import Protocol, TypedDict
import numpy as np  

class PoseResult(TypedDict):
    """
    AI 파이프라인이 한 프레임을 처리한 결과.
    """
    delta_depth: float
    nose_depth: float
    shoulder_depth: float
    detected: bool          # 포즈감지 성공여부
    confidence: float       # 포즈감지 신뢰도
    processing_time_ms: float

class PosturePipeline(Protocol):
    def process_frame(self, frame:np.ndarray) -> PoseResult:
        """
        한 프레임을 받아 자세 측정값을 반환.
        """

class MockPosturePipeline:
    """
    호출 횟수 기반 시뮬레이션 Mock 파이프라인.
    
    시나리오 (10 FPS 가정):
      프레임   1~ 100 (10초): 바른 자세  ← 캘리브레이션 구간
      프레임 101~ 150 ( 5초): 거북목     ← 모니터링 시작 직후
      프레임 151~ 200 ( 5초): 바른 자세
      프레임 201~ 250 ( 5초): 거북목
      ...
    
    이렇게 하면 클라이언트 시작 시점·네트워크 지연과 무관하게
    '캘리브레이션 끝난 직후 거북목 → 정상 → 거북목' 패턴이 보장됨.
    
    Protocol 인터페이스(process_frame만)를 그대로 유지함.
    """

    # 상수: 자세별 기준 ΔDepth (실험으로 얻을 가짜 값)
    GOOD_POSTURE_DEPTH = 0.15
    TURTLE_NECK_DEPTH = 0.40
    NOISE_AMPLITUDE = 0.03 # 프레임 간 노이즈

    # 시나리오 상수 (10 FPS 기준)
    CALIBRATION_FRAMES = 100  # 10초
    TURTLE_DURATION_FRAMES = 50  # 5초
    NORMAL_DURATION_FRAMES = 50  # 5초

    def __init__(self, model_path: str = ""):
        self._frame_count = 0
        print(f"[MockPipeline] 생성됨 (model_path 무시: {model_path!r})")

    def process_frame(self, frame:np.ndarray) -> PoseResult:
        """
        프레임(BGR)을 받아 가짜 결과 반환.
        실제 처리 시간을 흉내내기 위해 짧은 sleep도 포함.
        """

        start = time.perf_counter()
        # 실제 AI 처리에 30~50ms 걸린다고 가정
        time.sleep(random.uniform(0.03,0.05))
        
        self._frame_count = self._frame_count + 1

        base = self._senario_base(self._frame_count)
        """
        평균 0, 표준편차 0.03인 정규분포에서 랜덤 값을 뽑음
        결과적으로 delta는 base 근처에서 매 프레임마다 조금씩 다른 값이 됨
        --> 카메라의 흔들림을 표현
        """
        delta = base + random.gauss(0, self.NOISE_AMPLITUDE)

        # PoseResult가 TypedDict이기에 보기와 다르게 Dict 다.
        return PoseResult(
            delta_depth = delta,
            nose_depth = 0.5 + delta / 2,
            shoulder_depth = 0.5 - delta / 2,
            detected = True,
            confidence = random.uniform(0.85, 0.99),
            processing_time_ms = round((time.perf_counter() - start) * 1000, 2)
        )
    def _senario_base(self, frame_idx: int) -> float:
        """
        프레임 번호 → 시나리오상의 기준 ΔDepth 결정.
        """
        # 캘리브레이션 구간: 무조건 바른 자세
        if (frame_idx <= self.CALIBRATION_FRAMES):
            return self.GOOD_POSTURE_DEPTH

        post_cal = frame_idx - self.CALIBRATION_FRAMES
        cycle = self.TURTLE_DURATION_FRAMES + self.NORMAL_DURATION_FRAMES
        cycle_arg = (post_cal - 1) % cycle

        if (cycle_arg < self.TURTLE_DURATION_FRAMES):
            return self.TURTLE_NECK_DEPTH
        else:
            return self.GOOD_POSTURE_DEPTH






        


