"""
전체 플로우 + 세션 저장 테스트.

1. 캘리브레이션 (10초)
2. 모니터링 (15초): 거북목 1~2번 발생
3. stop_session 송신 → report_id 받음
4. HTTP API로 리포트 조회 → 통계 출력
"""

import asyncio
import io
import json
import time
import websockets
import httpx  # pip install httpx
import numpy as np
from PIL import Image


def make_fake_jpeg() -> bytes:
    arr = np.full((480, 640, 3), 255, dtype=np.uint8)
    img = Image.fromarray(arr)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=80)
    return buf.getvalue()


async def receive_until(ws, target_type: str, timeout: float = 30.0):
    """특정 type의 메시지를 받을 때까지 대기"""
    start = time.time()
    while time.time() - start < timeout:
        raw = await ws.recv()
        data = json.loads(raw)
        if data.get("type") == target_type:
            return data
    raise TimeoutError(f"{target_type} 메시지를 받지 못함")


async def main():
    uri = "ws://127.0.0.1:8000/ws/posture"
    fake = make_fake_jpeg()
    session_id = None
    report_id = None
    
    # 1. 캘리브레이션 + 모니터링
    async with websockets.connect(uri) as ws:
        # session_started 받기
        data = json.loads(await ws.recv())
        session_id = data["session_id"]
        print(f"세션 시작: {session_id[:8]}...")
        
        # 캘리브레이션 시작
        print("→ start_calibration")
        await ws.send(json.dumps({"type": "start_calibration"}))
        
        # 메시지 흘려버리기 + 프레임 전송
        async def send_frames(duration_sec: float):
            start = time.time()
            while time.time() - start < duration_sec:
                await ws.send(fake)
                await asyncio.sleep(0.1)
        
        async def drain_messages(stop_event: asyncio.Event):
            try:
                while not stop_event.is_set():
                    raw = await asyncio.wait_for(ws.recv(), timeout=0.5)
                    data = json.loads(raw)
                    t = data.get("type")
                    if t == "calibration_complete":
                        print(f"  ✅ 캘리브레이션 완료 baseline={data['baseline_delta_depth']}")
                    elif t == "detection_result" and data["is_turtle"]:
                        # 첫 거북목만 표시
                        pass
            except asyncio.TimeoutError:
                pass
        
        stop = asyncio.Event()
        drain_task = asyncio.create_task(drain_messages(stop))
        
        await send_frames(25.0)  # 캘리브 10s + 모니터링 15s
        
        stop.set()
        await asyncio.sleep(0.3)
        drain_task.cancel()
        
        try:
            await drain_task  # 추가: 완전히 종료될 때까지 대기
        except asyncio.CancelledError:
            pass
        # stop_session 송신
        print("→ stop_session")
        await ws.send(json.dumps({"type": "stop_session"}))
        
        ended = await receive_until(ws, "session_ended")
        report_id = ended.get("report_id")
        print(f"세션 종료. report_id={report_id[:8] if report_id else None}...")
    
    # 2. HTTP API로 리포트 조회
    if report_id:
        print()
        print("--- 리포트 조회 ---")
        async with httpx.AsyncClient() as client:
            r = await client.get(f"http://127.0.0.1:8000/api/sessions/{session_id}/report")
            data = r.json()
            
            report = data["report"]
            print(f"세션 시간: {data['duration_sec']:.2f}초")
            print(f"거북목 발생: {report['total_turtle_count']}회")
            print(f"거북목 총 시간: {report['total_turtle_duration_sec']:.2f}초")
            print(f"거북목 비율: {report['turtle_ratio'] * 100:.1f}%")
            print(f"최장 거북목: {report['longest_streak_sec']:.2f}초")
            print(f"이벤트 수: {len(data['events'])}")


if __name__ == "__main__":
    asyncio.run(main())