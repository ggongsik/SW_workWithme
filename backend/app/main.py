from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket
from app.websocket.handlers import get_ai_pipeline, handle_posture_connection
from app.websocket.manager import manager
from app.models.db import init_db
from app.api.report import router as report_router
import asyncio
import numpy as np

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[lifespan] DB 초기화 중...")
    await init_db()
    print("[lifespan] DB 준비 완료")

    print("[lifespan] AI 파이프라인 워밍업 중... (MPS 첫 실행 10~20초 소요)")
    dummy = np.zeros((480, 640, 3), dtype=np.uint8)
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, get_ai_pipeline().process_frame, dummy)
    print("[lifespan] AI 파이프라인 준비 완료")

    yield

    print("[lifespan] 앱 종료")

app = FastAPI(
    title="Work with 자세교정 Backend",
    version="0.1.0",
    lifespan=lifespan
)
app.include_router(report_router)

@app.get("/")
async def root():
    return {"status": "ok"}

@app.get("/health")
async def health():
    return {"status": "healthy", "active_sessions": manager.active_count}


# 클라이언트가 아래의 URL 로 웹소켓 연결을 요청하면, 함수 실행
# 이거 token 받는 코드로 수정 필요
@app.websocket("/ws/posture")
async def posture_ws(websocket: WebSocket):
    await handle_posture_connection(websocket)
