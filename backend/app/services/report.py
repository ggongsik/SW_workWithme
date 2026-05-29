"""
세션 리포트 계산.

입력: SessionState (메모리에 누적된 이벤트 로그)
출력: 리포트 통계 dict + 시간 단위 turtle 구간 리스트

이 모듈은 DB와 무관하다 — 순수 계산만 함.
저장은 호출자(handlers.py)가 담당.
"""

from dataclasses import dataclass
from typing import List

from app.websocket.manager import SessionState, PostureEvent

@dataclass
class TurtleInterval:
    """거북목이 시작되어 끝난 한 구간"""
    started_at: float
    ended_at: float
    duration_sec: float

@dataclass
class ReportStats:
    """세션 1개의 거북목 집계 (DailyStats 누적에 사용)"""
    total_turtle_duration_sec: float
    longest_streak_sec: float


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
    SessionState의 거북목 이벤트로 이 세션의 총 거북목 시간·최장 지속을 계산.
    turtle_ratio는 모니터링 시간으로 나눠야 하므로 DailyStats 조회 시점에 계산한다.
    """
    intervals = build_intervals(state.posture_events, session_ended_at)

    total_duration = sum(iv.duration_sec for iv in intervals)
    longest = max((iv.duration_sec for iv in intervals), default = 0.0)

    return ReportStats(
        total_turtle_duration_sec = round(total_duration, 2),
        longest_streak_sec = round(longest, 2)
    )




