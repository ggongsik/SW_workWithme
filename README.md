### 1. Python · numpy 버전 통일

**배경**
팀원마다 다른 버전을 쓰면 "내 컴에선 되는데" 문제가 발생합니다. MediaPipe는 버전별로 numpy 호환 범위가 달라서 특히 주의가 필요합니다.

**제안 (백엔드 입장)**
- Python: **3.11**
- numpy: **>=1.26, <2.0**

**근거**
- Python 3.11은 MediaPipe 0.10.x 전 버전을 지원 → 이설이 어떤 버전을 쓰든 호환
- numpy 1.26은 MediaPipe·PyTorch·OpenCV 모두와 안전한 교집합
- 학부 수업 수준에서 최신 numpy 2.x 기능이 필요한 경우는 거의 없음

**이설에게 질문**
1. MediaPipe 어떤 버전 사용 중? (0.10.14 / 0.10.21 / 0.10.31 등)
2. Depth Anything v2 돌리는 PyTorch 버전?
3. 위 제안(Python 3.11 + numpy 1.26)에 동의?

---

### 2. 의존성 관리 전략

**배경**
백엔드와 AI 파이프라인이 같은 Python 프로세스에서 돌아가서 패키지가 섞이게 됩니다.

**옵션**

| 옵션 | 설명 | 장단점 |
|---|---|---|
| A | 단일 `requirements.txt` (루트에 하나) | 단순. 충돌 시 디버깅 어려움 |
| B | 파트별 분리 (`backend/`, `ai/` 각각) | 어느 패키지가 어느 파트 소속인지 명확. **추천** |
| C | AI를 별도 프로세스로 분리 | 완전 독립. 학부 프로젝트엔 과도함 |

**백엔드 추천: 옵션 B**
이미 `backend/requirements.txt` + `backend/requirements-dev.txt` 구조로 시작했음.

**합의 필요**
- 옵션 B로 가는 것에 동의?
- 설치 순서 통일: `numpy` → `mediapipe`/`torch` → `fastapi` (numpy가 의도치 않게 다운그레이드되는 것 방지)

---

### 3. AI 파이프라인 인터페이스 명세 확정

**배경**
백엔드는 현재 Mock 파이프라인으로 개발 중. 통합 시점에 `import` 한 줄만 바꿔서 갈아끼우려면 인터페이스가 정확히 일치해야 함.

**제안 명세**

```python
# 모듈 위치: ai/pipeline.py
import numpy as np
from typing import TypedDict

class PoseResult(TypedDict):
    delta_depth: float          # 코 깊이 - 어깨 평균 깊이
    nose_depth: float
    shoulder_depth: float
    detected: bool              # 포즈 감지 성공 여부
    confidence: float           # 0.0 ~ 1.0

class PosturePipeline:
    def __init__(self, model_path: str):
        """서비스 시작 시 한 번만 호출. 모델 로딩."""
        ...

    def process_frame(self, frame: np.ndarray) -> PoseResult:
        """
        입력: BGR numpy array, shape (H, W, 3), dtype uint8
        출력: PoseResult dict
        포즈 감지 실패 시 detected=False, 나머지 값 0.0
        """
        ...
```

**합의 필수 사항**
- 프레임 형식: **BGR** (OpenCV 표준), shape `(H, W, 3)`, dtype `uint8`
- 모델 로딩은 `__init__`에서 **한 번만**. 매 프레임 로딩 금지
- EMA 스무딩·이상치 판별은 **백엔드 책임** → 파이프라인은 raw 측정값만 반환
- 포즈 감지 실패 시 예외 던지지 말고 `detected=False`로 반환

**이설에게 질문**
1. 위 명세에 동의?
2. PoseResult에 추가하고 싶은 필드 있는지? (예: 좌/우 어깨 좌표, 포즈 신뢰도 세부 정보)

---

### 4. WebSocket 메시지 형식 확정

**배경**
프론트와 백엔드가 주고받을 JSON 형식이 어긋나면 모든 통신이 깨짐.

**전체 흐름**
[연결] → [idle] → [calibrating, 10초] → [monitoring] → [ended]

**클라이언트 → 서버**

| type | 페이로드 | 설명 |
|---|---|---|
| `start_calibration` | 없음 | 캘리브레이션 시작 |
| `stop_session` | 없음 | 세션 종료 |
| (binary) | JPEG bytes | 웹캠 프레임. JSON 아닌 binary frame |

**서버 → 클라이언트** (JSON, 모두 `type` 필드 포함)

| type | 송신 시점 |
|---|---|
| `session_started` | 연결 직후 (session_id 발급) |
| `calibration_progress` | 캘리브레이션 중 매 프레임 |
| `calibration_complete` | 10초 경과 후 |
| `detection_result` | 모니터링 중 매 프레임 |
| `session_ended` | stop_session 응답 |
| `error` | 오류 발생 시 |

자세한 페이로드는 `backend/app/models/schemas.py` 참조.

**김영로에게 질문**
1. 프레임 전송 형식: binary frame (ArrayBuffer)로 OK?
2. `calibration_progress`를 매 프레임 받는 게 부담스러운지? (매번 보낼 필요 없기도 하니깐)
3. 프론트에서 추가로 필요한 필드 있는지?

---

### 5. AI 처리 시간 측정

**왜 중요한가**
한 프레임당 처리 시간이 30 FPS 처리 가능 여부를 결정. 50ms 넘으면 클라이언트의 전송 FPS를 낮춰야 함.

**이설에게 부탁**
- MediaPipe + Depth Anything v2 Small 한 프레임 처리에 평균/최대 몇 ms?
- 노트북·데스크탑·GPU 유무별로 차이 있는지?

이 수치에 따라 결정될 것:
- 클라이언트 송신 FPS (10 / 15 / 30)
- 백엔드의 프레임 큐 처리 전략

---

### 6. 캘리브레이션 진행률 송신 빈도

**현재 구현**
매 프레임(약 10 FPS)마다 `calibration_progress` 메시지 송신.

**옵션**
- **A**: 매 프레임 (현재) — 부드러운 프로그레스 바
- **B**: 0.2초 throttle (5 FPS) — 충분히 부드럽고 트래픽 절감
- **C**: 1초 단위 — "1/10 → 2/10" 식 띄엄띄엄 표시

**김영로에게 질문**
- 프론트의 프로그레스 표시 디자인이 어떤가?
- 위 옵션 중 어느 것이 적합?

백엔드 변경은 한 줄 수준이라 부담 없음.

---

### 7. 캘리브레이션 중 사용자 부재 처리

**상황**
캘리브레이션 10초 동안 사용자가 자리를 비우면 (얼굴이 프레임에 없음), 그 프레임들의 ΔDepth는 의미 없음.

**옵션**
- **A**: 무시 (현재) — 단순. 데이터 부족 시 자연히 `INSUFFICIENT_SAMPLES` 에러
- **B**: 일시정지 — 자리 비우는 동안 타이머 멈춤. 복잡도 증가
- **C**: 즉시 실패 — 너무 엄격할 수 있음

**손건영(UX)에게 질문**
- 어떤 UX가 자연스러운가?
- 메인 플로우 우선이라면 A로 가도 OK?

---

### 8. 거북목 알림 지속 시간 임계값

**문제**
지금은 ΔDepth가 임계값을 넘는 순간 = 거북목으로 판정. 하지만 1초간 책상 위 물건 집으려고 몸을 숙이는 것도 거북목으로 잡힘.

**제안: "거북목 상태가 N초 이상 지속되어야 진짜 알림"**

**옵션**
- **A**: 백엔드에서 처리 — N초 지속 후 `is_turtle=True`로 보고. 일관성 있음. **추천**
- **B**: 프론트에서 처리 — 백엔드는 즉시 보고, 프론트가 N초 후 PIP 표시
- **C**: 처리 안 함 — 단순함. 알림 과다 가능성

**손건영(UX) + 최성민에게 합의 필요**
- 적절한 N값은? (3초 / 5초 / 10초)
- 백엔드 처리 vs 프론트 처리 어디에 둘지?

---

### 9. 임계값 파라미터 튜닝

**현재 디폴트**
- `EMA_ALPHA = 0.3`
- `HYSTERESIS_LOW_SIGMA = 1.0` (정상 복귀 임계값: baseline + 1σ)
- `HYSTERESIS_HIGH_SIGMA = 2.0` (거북목 진입 임계값: baseline + 2σ)

**언제 튜닝?**
이설의 실제 AI 파이프라인이 통합되어 실측 데이터가 나온 후. Mock 데이터로는 의미 있는 튜닝 어려움.

**조정 가이드 (실측 후)**
- 알림이 너무 자주 뜸 → `HIGH_SIGMA`를 2.5~3.0으로
- 거북목인데 알림 늦음 → `EMA_ALPHA`를 0.4~0.5로
- 미세한 떨림 → `LOW_SIGMA`를 0.5로 (히스테리시스 폭 늘림)

---

### 10. 리포트 추가 통계 항목

**현재 통계**
- 거북목 발생 횟수
- 거북목 총 시간
- 거북목 비율
- 최장 거북목 지속 시간

**확장 가능 후보**
- 시간대별 거북목 빈도 (오전 / 오후 / 저녁)
- 거북목 평균 지속 시간
- 캘리브레이션 baseline 대비 평균 ΔDepth (자세 무너짐 정도)
- 분 단위 거북목 발생 추이 (그래프용 시계열 데이터)

**손건영(UX) + 김영로(프론트)에게 질문**
- 사용자에게 어떤 정보가 가장 의미 있을까?
- 차트 디자인이 결정되면 거기 맞는 데이터 형식 알려주세요

추가는 `summary_json` 필드에 넣으면 되니 부담 없음.
