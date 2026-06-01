"""
Isolation Forest 기반 개인화 거북목 판정.

설계 (팀 협의 확정):
- 학습 데이터: 캘리브레이션에서 수집한 delta_depth 값들만 사용 (단일 feature).
- 모델 수명: 매 캘리브레이션마다 새로 학습. 누적 데이터/이전 모델 재사용 없음.
- 모니터링 프레임은 학습에 사용하지 않음.
- 판정: 모니터링 시 EMA 스무딩된 delta_depth를 모델에 넣어 이상치(거북목) 여부 판정.

주의 (한쪽 방향 가드):
- IsolationForest는 양방향 이상치를 잡는다. 거북목은 delta_depth가 baseline보다
  '높은' 쪽이므로, 낮은 쪽 이상치를 거북목으로 오판하지 않도록 가드를 둔다.
- TODO: 가드 방향/사용 여부는 AI 파트와 협의 후 조정 가능.
"""

from dataclasses import dataclass
from typing import List, Optional

import numpy as np
from sklearn.ensemble import IsolationForest

# ===== 하이퍼파라미터 (임의값, 튜닝 필요) =====
# contamination: 정상 분포 경계를 얼마나 타이트하게 잡을지 결정.
#   1차원 IsolationForest는 학습 범위 밖 값을 외삽하지 못해 점수가 평탄해지는 한계가 있다.
#   contamination을 적당히 높여(0.1) 경계를 학습 데이터 가장자리에 맞추면,
#   범위를 벗어난 값(거북목)이 안정적으로 이상치로 분류된다.
#   너무 낮으면(0.01~0.05) 범위 밖 값도 정상으로 새고, 너무 높으면(auto) 정상값까지 과검출됨.
# TODO: 실측 데이터로 튜닝 필요 (AI 파트와 협의).
IF_CONTAMINATION = 0.05
IF_N_ESTIMATORS = 200
IF_RANDOM_STATE = 42


@dataclass
class PostureModel:
    """학습된 개인화 모델 + 판정에 필요한 메타."""
    forest: IsolationForest
    baseline: float          # 학습 데이터 평균 (한쪽 방향 가드 기준)
    sample_count: int


def train_model(samples: List[float]) -> Optional[PostureModel]:
    """
    캘리브레이션 delta_depth 샘플로 Isolation Forest 학습.

    유효 샘플이 너무 적으면 None 반환 (호출자가 처리).
    """
    arr = np.asarray(samples, dtype=np.float64)
    arr = arr[np.isfinite(arr)]
    if arr.size < 2:
        return None

    # sklearn은 2D 입력을 요구: (n_samples, n_features=1)
    X = arr.reshape(-1, 1)

    forest = IsolationForest(
        n_estimators=IF_N_ESTIMATORS,
        contamination=IF_CONTAMINATION,
        random_state=IF_RANDOM_STATE,
    )
    forest.fit(X)

    return PostureModel(
        forest=forest,
        baseline=float(np.mean(arr)),
        sample_count=int(arr.size),
    )


def is_turtle(model: PostureModel, smoothed_delta_depth: float) -> bool:
    """
    EMA 스무딩된 delta_depth를 모델에 넣어 거북목 여부 판정.

    조건: IsolationForest가 이상치(-1)로 판정 AND 값이 baseline보다 높은 쪽(거북목 방향).
    """
    if not np.isfinite(smoothed_delta_depth):
        return False

    X = np.array([[smoothed_delta_depth]], dtype=np.float64)
    # predict: 정상 1, 이상치 -1
    is_anomaly = int(model.forest.predict(X)[0]) == -1

    # 한쪽 방향 가드: 거북목은 baseline보다 높은 쪽만 인정
    on_turtle_side = smoothed_delta_depth > model.baseline

    return is_anomaly and on_turtle_side
