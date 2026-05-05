"""
세션 리포트 계산.

입력: SessionState (메모리에 누적된 이벤트 로그)
출력: 리포트 통계 dict + 시간 단위 turtle 구간 리스트

이 모듈은 DB와 무관하다 — 순수 계산만 함.
저장은 호출자(handlers.py)가 담당.
"""

import json
import time
from dataclasses import dataclass
from typing import List, Tuple

from app.websocket.manager import SessionState, PostureEvent

@dataclass
class TurtleInterval:
    """거북목이 시작되어 끝난 한 구간"""
    started_at: float
    ended_at: float
    duration_sec: float

@dataclass
class ReportStats:
    """리포트 핵심 통계"""
    total_turtle_count: int
    total_turtle_duration_sec: float
    turtle_ratio: float # 0.0~1.0
    longest_streak_sec: float
    intervals: List[TurtleInterval]
    summary_json: str # 추가 정보 직렬화


def build_intervals(
    events: List[PostureEvent],
    session_ended_at: float
) -> List[TurtleInterval]:
    """
    이벤트 로그 → 거북목 구간 리스트로 변환.
    
    이벤트는 [정상→거북목→정상→거북목→...] 식의 상태 전이.
    연속한 두 이벤트 (turtle=True, turtle=False) 쌍이 한 구간을 이룸.
    
    마지막이 turtle=True로 끝나면 session_ended_at을 끝점으로 사용.
    """
    intervals: List[TurtleInterval] = []

    i = 0
    while (i < len(events)):
        ev = events[i]
        if ev.is_turtle:
            start = ev.timestamp
            # 다음 False 이벤트 찾기
            end = session_ended_at # 기본값: 세션 끝까지 거북목 지속
            for j in range(i+1, len(events)):
                if not events[j].is_turtle:
                    end = events[j].timestamp
                    break

            intervals.append(TurtleInterval(
                started_at = start,
                ended_at = end,
                duration_sec = end - start
            ))
        i = i + 1
    
    return intervals

def compute_stats(state: SessionState, session_ended_at: float) -> ReportStats:
    """
    SessionState를 받아 리포트 통계를 계산.
    """
    intervals = build_intervals(state.posture_events ,session_ended_at)

    total_count = len(intervals)
    total_duration = sum(iv.duration_sec for iv in intervals)
    longest = max((iv.duration_sec for iv in intervals), default = 0.0)

    session_duration = session_ended_at - state.started_at
    ratio = total_duration / session_duration if session_duration > 0 else 0.0

    # 추가 정보를 summary에 담기
    summary = {
        "session_duration_sec": round(session_duration, 2),
        "calibration_baseline": state.baseline_delta_depth,
        "calibration_std": state.baseline_std,
        "threshold": state.threshold,
        "interval_durations": [round(iv.duration_sec, 2) for iv in intervals]
    }

    return ReportStats(
        total_turtle_count = total_count,
        total_turtle_duration_sec = round(total_duration, 2),
        turtle_ratio = round(ratio, 4),
        longest_streak_sec = round(longest, 2),
        intervals = intervals,
        summary_json = json.dumps(summary, ensure_ascii = False)
    )




