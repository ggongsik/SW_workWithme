import sys
import time
import cv2
import torch
import numpy as np
import mediapipe as mp
from typing import TypedDict, Optional

import os; sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "Depth-Anything-V2"))
from depth_anything_v2.dpt import DepthAnythingV2


class PoseResult(TypedDict):
    delta_depth:      float   # 코 깊이 - 어깨 깊이 (핵심값)
    nose_depth:       float   # 코 깊이값
    shoulder_depth:   float   # 어깨 평균 깊이값
    mp_delta_z:       float   # MediaPipe Z값 (디버깅·비교용)
    detected:         bool    # 포즈 감지 성공 여부
    confidence:       float   # 신뢰도 0.0~1.0
    processing_time_ms: float # 처리 시간


class PosturePipeline:
    """
    MediaPipe + Depth Anything v2 Small 융합 파이프라인
    - 서비스 시작 시 한 번만 로딩
    - process_frame()으로 매 프레임 처리
    - EMA 스무딩·이상치 판별은 백엔드 책임
    """

    def __init__(self, model_path: str, device: Optional[str] = None):
        """
        model_path: depth_anything_v2_vits.pth 경로
        device: 'mps' / 'cuda' / 'cpu' (None이면 자동 선택)
        """
        if device is None:
            if torch.backends.mps.is_available():
                device = 'mps'
            elif torch.cuda.is_available():
                device = 'cuda'
            else:
                device = 'cpu'
        self.device = device
        print(f"[PosturePipeline] 디바이스: {self.device}")

        # ── MediaPipe ──────────────────────────────
        self._mp_pose = mp.solutions.pose
        self._pose = self._mp_pose.Pose(
            static_image_mode=True,
            model_complexity=1,
            min_detection_confidence=0.3,
            min_tracking_confidence=0.3
        )

        # ── Depth Anything v2 Small ────────────────
        self._depth_model = DepthAnythingV2(
            encoder='vits',
            features=64,
            out_channels=[48, 96, 192, 384]
        )
        self._depth_model.load_state_dict(
            torch.load(model_path, map_location='cpu')
        )
        self._depth_model = self._depth_model.to(self.device).eval()
        print(f"[PosturePipeline] 모델 로딩 완료: {model_path}")

    def process_frame(self, frame: np.ndarray) -> PoseResult:
        """
        입력: BGR numpy array, shape (H, W, 3), dtype uint8
        출력: PoseResult
        포즈 감지 실패 시 detected=False, 나머지 값 0.0 반환
        """
        start = time.perf_counter()

        # 640x480으로 리사이즈
        frame = cv2.resize(frame, (640, 480))
        h, w = frame.shape[:2]

        # ── MediaPipe ──────────────────────────────
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = self._pose.process(frame_rgb)

        if not results.pose_landmarks:
            elapsed = (time.perf_counter() - start) * 1000
            return PoseResult(
                delta_depth=0.0,
                nose_depth=0.0,
                shoulder_depth=0.0,
                mp_delta_z=0.0,
                detected=False,
                confidence=0.0,
                processing_time_ms=elapsed
            )

        lm = results.pose_landmarks.landmark
        P  = self._mp_pose.PoseLandmark

        # ── Depth Anything ─────────────────────────
        depth_map = self._depth_model.infer_image(frame)

        # 5x5 패치 평균으로 깊이값 읽기
        def get_depth(lmk) -> float | None:
            if lmk.x < 0.0 or lmk.x > 1.0 or lmk.y < 0.0 or lmk.y > 1.0:
                return None
            x = int(lmk.x * (w - 1))
            y = int(lmk.y * (h - 1))
            x1, x2 = max(0, x-2), min(w, x+3)
            y1, y2 = max(0, y-2), min(h, y+3)
            patch = depth_map[y1:y2, x1:x2]
            result = float(np.mean(patch))
            if np.isnan(result):
                return None
            return result

        nose_d    = get_depth(lm[P.NOSE])
        l_sh_d    = get_depth(lm[P.LEFT_SHOULDER])
        r_sh_d    = get_depth(lm[P.RIGHT_SHOULDER])
        if nose_d is None or l_sh_d is None or r_sh_d is None:
            return PoseResult(
                delta_depth=0.0,
                nose_depth=0.0,
                shoulder_depth=0.0,
                mp_delta_z=0.0,
                detected=False,
                confidence=0.0,
                processing_time_ms=round((time.perf_counter()-start)*1000, 2)
            )
        shoulder_d = (l_sh_d + r_sh_d) / 2
        delta      = nose_d - shoulder_d

        # MediaPipe Z값 (비교용)
        mp_sh_z    = (lm[P.LEFT_SHOULDER].z + lm[P.RIGHT_SHOULDER].z) / 2
        mp_delta_z = lm[P.NOSE].z - mp_sh_z

        # 신뢰도 (코 랜드마크 visibility 사용)
        confidence = float(lm[P.NOSE].visibility)

        elapsed = (time.perf_counter() - start) * 1000

        return PoseResult(
            delta_depth=round(delta, 4),
            nose_depth=round(nose_d, 4),
            shoulder_depth=round(shoulder_d, 4),
            mp_delta_z=round(mp_delta_z, 4),
            detected=True,
            confidence=round(confidence, 4),
            processing_time_ms=round(elapsed, 2)
        )

    def close(self):
        self._pose.close()