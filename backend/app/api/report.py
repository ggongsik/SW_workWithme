"""
리포트 조회 HTTP API.

프론트 exit 흐름:
  stop_session(WS)으로 그날 통계 누적 저장
  → GET /api/users/me/report 로 오늘 + 최근 7일 집계를 받아 화면 표시.
"""

from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Header, Request
from sqlalchemy import select

from app.models.db import get_db_session
from app.models.db_models import DailyStatsRecord
from app.auth.dev_auth import resolve_local_dev_uid
from app.auth.firebase_auth import verify_token
from app.services.user_service import get_or_create_user


router = APIRouter(prefix="/api", tags=["report"])  # tags : docs에 나옴


async def _resolve_user_id(authorization: str | None, request: Request) -> str:
    """`Authorization: Bearer <firebase_token>` 헤더에서 내부 user_id를 얻는다."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    token = authorization.split(" ", 1)[1]
    firebase_uid = resolve_local_dev_uid(token, request.headers.get("origin") or request.headers.get("referer"))
    if firebase_uid is not None:
        return await get_or_create_user(firebase_uid)

    firebase_uid = verify_token(token)
    if firebase_uid is None:
        raise HTTPException(status_code=401, detail="Invalid token")
    return await get_or_create_user(firebase_uid)


def _ratio(turtle_sec: float, monitoring_sec: float) -> float:
    """거북목 비율 = 거북목 시간 / 모니터링 시간. 모니터링 0이면 0.0."""
    return round(turtle_sec / monitoring_sec, 4) if monitoring_sec > 0 else 0.0


@router.get("/users/me/report")
async def get_my_report(request: Request, authorization: str | None = Header(default=None)) -> dict:
    """로그인 사용자의 오늘 통계 + 최근 7일 거북목 비율 추이."""
    user_id = await _resolve_user_id(authorization, request)

    # 최근 7일 (오래된 날 → 오늘 순), 로컬 날짜 기준
    days = [(datetime.now() - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(6, -1, -1)]
    today = days[-1]

    async with get_db_session() as db:
        stmt = select(DailyStatsRecord).where(
            DailyStatsRecord.user_id == user_id,
            DailyStatsRecord.date.in_(days),
        )
        result = await db.execute(stmt)
        rows = {r.date: r for r in result.scalars().all()}

    # 7일 추이: 데이터 없는 날은 monitoring 0 → 프론트가 '사용 안 함' 표시
    weekly_trend = []
    for d in days:
        r = rows.get(d)
        monitoring = r.total_monitoring_duration_sec if r else 0.0
        turtle = r.total_turtle_duration_sec if r else 0.0
        weekly_trend.append({
            "date": d,
            "turtle_ratio": _ratio(turtle, monitoring),
            "monitoring_duration_sec": round(monitoring, 2),
        })

    # 오늘 데이터
    t = rows.get(today)
    today_data = {
        "date": today,
        "total_turtle_duration_sec": round(t.total_turtle_duration_sec, 2) if t else 0.0,
        "longest_streak_sec": round(t.longest_streak_sec, 2) if t else 0.0,
        "total_monitoring_duration_sec": round(t.total_monitoring_duration_sec, 2) if t else 0.0,
        "turtle_ratio": _ratio(
            t.total_turtle_duration_sec if t else 0.0,
            t.total_monitoring_duration_sec if t else 0.0,
        ),
    }

    return {"today": today_data, "weekly_trend": weekly_trend}
