# 🎤 VRM 자세교정 데모 — Miku UI

VRM 캐릭터(하츠네 미쿠)를 활용한 자세교정 알림 시스템의 프론트엔드입니다.

## 📅 2025-05-14 업데이트 요약

### 1. 절차적 애니메이션 시스템 (Procedural Animation)

- **`applyPose()` 함수 리팩토링**: 뼈대를 즉시 꺾지 않고 **목표 각도(Target)만 설정**
- **매 프레임 Lerp 보간**: `updateProceduralAnimation(delta)` — 현재 → 목표를 `LERP_SPEED * delta`로 부드럽게 전환
- **호흡 시스템**: `updateBreathing(delta)` — chest/spine 뼈대에 사인파 미세 움직임 적용
  - chest: `sin(t * 1.5) * 0.004`
  - spine: `sin(t * 1.2 + 0.5) * 0.002`
- **배열 캐싱**: `targetPoseEntries` 캐싱으로 매 프레임 `Object.entries()` 호출 제거

### 2. Document Picture-in-Picture API

- 기존 **Video PiP** (`video.requestPictureInPicture()`) → **Document PiP** (`documentPictureInPicture.requestWindow()`)로 교체
- PiP 내부에 **HTML DOM을 직접 삽입** 가능 (버튼, 입력 등 UI 요소)
- PiP 레이아웃:
  - 캐릭터 캔버스 **전체화면**
  - YouTube 컨트롤 + 상태 표시 **투명 오버레이** (글래스모피즘)
  - 포즈별 **네온 테두리** (실선 border + 3중 레이어 box-shadow 글로우)
- **별도 Three.js 렌더러** (antialias OFF, 30fps 제한)
- Chrome 116+ 필요

### 3. YouTube IFrame API 연동

- YouTube IFrame API를 **메인 문서**에 로드 (크로스 문서 스크립팅 문제 회피)
- 사용자가 **YouTube 링크를 직접 입력** → `extractYouTubeId()` 파싱 → 재생
- 숨겨진 플레이어 (120x80px, opacity:0)로 **오디오만 재생**
- PiP 내부 버튼이 메인 문서의 `ytPlayer`를 원격 제어
- 재생 중 **곡 제목 자동 표시**

### 4. Spotify 스타일 UI

- **PiP 버튼**: `linear-gradient(#1DB954 → #1ed760)` + 글로우 + hover 스케일
- **YouTube URL 입력**: 다크 테마 + 포커스 시 `#1DB954` 보더
- **PiP 컨트롤바**: `backdrop-filter:blur(12px)` + 반투명 배경

### 5. 프론트-백엔드 연동 레이어

- `API` 모듈: `baseUrl` 설정 시 REST API 자동 호출
  - `GET /api/pose` — 포즈 명령 수신
  - `POST /api/status` — 상태 전송
- `postMessage` 브릿지: front.html과의 iframe 호환
  - `SET_POSE` — 포즈 전환
  - `GET_STATUS` — 현재 상태 응답

### 6. YouTube 재생 최적화

| 항목 | 이전 | 이후 | 효과 |
|---|---|---|---|
| PiP 렌더 FPS | 60fps | 30fps | GPU -50% |
| PiP 안티앨리어싱 | ON | OFF | GPU 추가 -30% |
| DOM 업데이트 | 60fps | 2fps | CPU 메인스레드 대폭 경감 |
| 루프 내 GC | Object.keys/entries 매 프레임 | 캐싱 | GC 스파이크 제거 |
| YouTube iframe | 1x1px | 120x80px | Chrome 쓰로틀링 회피 |
| YouTube 품질 | 기본 (auto) | small | 비디오 디코딩 부하 최소화 |

---

## 🛠 기술 스택

- **Three.js** 0.168.0 — 3D 렌더링
- **@pixiv/three-vrm** 3.1.2 — VRM 캐릭터 로드
- **YouTube IFrame API** — 음악 재생
- **Document Picture-in-Picture API** — 항상 위 창
- Vanilla HTML/CSS/JS (프레임워크 없음)

## 📁 파일 구조

```
miku/
├── index.html          ← 메인 (개발/디버그 + 전체 기능)
├── front.html          ← 팀원 프론트엔드 (호환성 확인용)
├── HatsuneMikuNT.vrm   ← VRM 캐릭터 모델
├── lofi_room.glb       ← 3D 맵 모델
└── README.md           ← 이 문서
```

## 🚀 실행 방법

```bash
npx -y http-server -p 8080 --cors
# 브라우저에서 http://localhost:8080/index.html (Chrome 116+)
```
