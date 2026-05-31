# WebSocket은 연결이 계속 유지되기 때문에, "누가 지금 접속 중이고, 어떤 상태인가" 를 서버가 기억해야 해. 이걸 깔끔하게 관리하려고 매니저 클래스를 둬.

import uuid # 고유 ID 생성
import time
from typing import Any, Dict, Optional, List, TYPE_CHECKING # 'Optional[float] = None' : float, None이 올 수 있는데 기본값은 None
from dataclasses import dataclass, field

if TYPE_CHECKING:
    from fastapi import WebSocket
else:
    WebSocket = Any

@dataclass
class PostureEvent:
    """거북목 상태 변화 이벤트 (Step 9의 리포트 생성에 사용)"""
    timestamp: float
    is_turtle: bool
    delta_depth_smoothed: float

@dataclass # 데이터 저장을 목적으로 하는 클래스를 쉽게 만들 수 있도록
class SessionState:
    session_id: str
    websocket: WebSocket
    user_id: Optional[str] = None  # Firebase 인증 후 채워짐 (DB의 users.id, UUID)
    mode: str = "idle" # idle | calibrating | monitoring

    # time.time : 현재 시간을 초 단위로
    # default_factory : 객체가 생성될 때마다 함수 실행, 없이 하면 모든 객체가 같은 시간
    started_at: float = field(default_factory = time.time)

    calibration_samples: list = field(default_factory=list)
    calibration_started_at: Optional[float] = None

    # start_monitoring 메시지를 받은 시각. stop_session까지가 순수 모니터링 시간.
    monitoring_started_at: Optional[float] = None

    baseline_delta_depth: Optional[float] = None
    baseline_std: Optional[float] = None
    threshold: Optional[float] = None # baseline_delta_depth + 2*baseline_std
    ema_value: Optional[float] = None # 직전 하나만 기억

    is_turtle_active: bool = False

    posture_events: List[PostureEvent] = field(default_factory=list)

@dataclass
class CalibrationSnapshot:
    baseline_delta_depth: float
    baseline_std: float
    threshold: float

# 모든 WebSocket 연결을 추적하는 중앙 매니저.
class ConnectionManager:
    def __init__(self):
        self.sessions: Dict[str, SessionState] = {}
        self.calibration_snapshots: Dict[str, CalibrationSnapshot] = {}

    async def connect(self, websocket: WebSocket, user_id: Optional[str] = None) -> SessionState:
        await websocket.accept()
        session_id = str(uuid.uuid4())
        state = SessionState(session_id = session_id, websocket = websocket, user_id = user_id)
        self.restore_calibration(state)
        self.sessions[session_id] = state
        return state

    def disconnect(self, session_id: str) -> None:
        self.sessions.pop(session_id, None)

    def get(self, session_id: str) -> Optional[SessionState]:
        return self.sessions.get(session_id)

    def remember_calibration(self, state: SessionState) -> None:
        if (
            state.user_id is None
            or state.baseline_delta_depth is None
            or state.baseline_std is None
            or state.threshold is None
        ):
            return

        self.calibration_snapshots[state.user_id] = CalibrationSnapshot(
            baseline_delta_depth=state.baseline_delta_depth,
            baseline_std=state.baseline_std,
            threshold=state.threshold,
        )

    def forget_calibration(self, user_id: Optional[str]) -> None:
        if user_id is None:
            return
        self.calibration_snapshots.pop(user_id, None)

    def restore_calibration(self, state: SessionState) -> bool:
        if state.user_id is None:
            return False

        snapshot = self.calibration_snapshots.get(state.user_id)
        if snapshot is None:
            return False

        state.mode = "monitoring"
        state.baseline_delta_depth = snapshot.baseline_delta_depth
        state.baseline_std = snapshot.baseline_std
        state.threshold = snapshot.threshold
        state.ema_value = snapshot.baseline_delta_depth
        return True

    @property # a = ConnectionManager(); a.active_count; -> 메서드를 변수처럼 쓰도록
    def active_count(self) -> int:
        return len(self.sessions)

manager = ConnectionManager() # 모듈 맨 아래에서 인스턴스 하나 만들어서 모든 곳에서 from app.websocket.manager import manager로 import해 공유.
