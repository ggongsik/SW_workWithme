
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket
from app.websocket.handlers import handle_posture_connection
from app.websocket.manager import manager
from app.models.db import init_db
from app.api.report import router as report_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    """앱 시작·종료 시 실행되는 코드"""
    # 시작 시
    print("[lifespan] DB 초기화 중...")
    await init_db()
    print("[lifespan] DB 준비 완료")

    yield # ← 여기서 앱이 동작
    
    # 종료 시 (지금은 특별히 할 일 없음)
    print("[lifespan] 앱 종료")


app=FastAPI(
    title="Work with 자세교정 Backend",
    version="0.1.0",
    lifespan = lifespan # lifespan 호출
)

app.include_router(report_router)

@app.get("/")
async def root():
    return {"status":"ok"}

@app.get("/health")
async def health():
    return {"status": "healthy", "active_sessions": manager.active_count}

@app.websocket("/ws/posture")
async def posture_ws(websocket: WebSocket):
    await handle_posture_connection(websocket)

