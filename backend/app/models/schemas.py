from pydantic import BaseModel, Field
from typing import Literal, Optional

class ClientMessage(BaseModel):
    type: str # 변수

class StartCalibration(ClientMessage): # 상속의 목적 : 이건 `ClientMessage`, 클라이언트가 보내는 메시지다. 
    type: Literal["start_calibration"] # 상속받아서 재정의

class StopSession(ClientMessage):
    type: Literal["stop_session"]



class SessionStarted(BaseModel):
    type: Literal["session_started"] = "session_started" # 객체 생성 시 매번 쓰기 귀찮고, 어차피 고정값이니깐
    session_id: str                                      # 서버가 보내는 건 여기서 만들어서 보내기 때문에 그냥 넣어버려
    timestamp: float

class CalibrationComplete(BaseModel):
    type: Literal["calibration_complete"] = "calibration_complete"
    baseline_delta_depth: float
    baseline_std: float
    threshold: float # baseline_delta_depth + 2*baseline_std

class DetectionResult(BaseModel):
    type: Literal["detection_result"] = "detection_result"
    is_turtle: bool
    delta_depth: float
    delta_depth_smoothed: float
    baseline: float
    threshold: float
    timestamp: float

class SessionEnded(BaseModel):
    type: Literal["session_ended"] = "session_ended"
    session_id: str
    report_id: Optional[str] = None
    duration_sec: float

class ErrorMessage(BaseModel):
    type: Literal["error"] = "error"
    code: str
    message: str