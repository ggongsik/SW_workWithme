import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from fastapi import WebSocket
else:
    WebSocket = Any


@dataclass
class PostureEvent:
    """Posture state transition event used for reports."""

    timestamp: float
    is_turtle: bool
    delta_depth_smoothed: float


@dataclass
class SessionState:
    session_id: str
    websocket: WebSocket
    mode: str = "idle"  # idle | calibrating | monitoring
    started_at: float = field(default_factory=time.time)

    calibration_samples: list = field(default_factory=list)
    calibration_started_at: Optional[float] = None

    baseline_delta_depth: Optional[float] = None
    baseline_std: Optional[float] = None
    threshold: Optional[float] = None
    ema_value: Optional[float] = None

    is_turtle_active: bool = False
    posture_events: List[PostureEvent] = field(default_factory=list)


class ConnectionManager:
    def __init__(self):
        self.sessions: Dict[str, SessionState] = {}

    async def connect(self, websocket: WebSocket) -> SessionState:
        await websocket.accept()
        session_id = str(uuid.uuid4())
        state = SessionState(session_id=session_id, websocket=websocket)
        self.sessions[session_id] = state
        return state

    def disconnect(self, session_id: str) -> None:
        self.sessions.pop(session_id, None)

    def get(self, session_id: str) -> Optional[SessionState]:
        return self.sessions.get(session_id)

    @property
    def active_count(self) -> int:
        return len(self.sessions)


manager = ConnectionManager()
