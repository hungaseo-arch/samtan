# WO-TMS-2026-11-STEP1 — 단계 1 숫자 신뢰 회복 : prod 반영 · 검증 · 배포

- 작성 : 2026-11-08 · 집사(TMS 개선 총괄) → 실행 : 맥 VS Code Claude Code
- 근거 : `docs/PLAN-TMS-2026-11-고객설득_개선방안.md` 단계 1, `docs/WO-TMS-2026-11-LIFE-KM_결과.md` §9, `docs/decisions.md` M-12 ~ M-16
- 작업 브랜치 : `fix/life-km-first-mount` (HEAD `256a3ee` 이후, PR #6 `feat/web-improvements-20261016` 위에 쌓임)
- 성격 : 코드 신규 개발 없음. 이미 구현된 변경의 push · prod DB 반영 · 검증 · 머지 · 배포

---

## 0. 원칙

- 승인 게이트(G1 ~ G4) 앞에서 반드시 멈추고 보고 후 대기. 쎄오님이 채팅에 「G○ 승인」이라고 입력하기 전에는 실행 금지
- 한 단계라도 기대값과 다르면 다음 단계로 넘어가지 않음. 원인 추정만 적고 수정·재시도는 쎄오님 확인 후
- 수치를 지어내지 않음. 실행 못 한 항목은 「미실행」과 사유로 보고
- 저장소 `CLAUDE.md` 규칙 우선. 이 지시서와 충돌하면 진행 전 충돌표로 질문
- prod 조회는 읽기 전용만. DB 비밀번호는 쎄오님이 직접 입력, 파일·히스토리·보고서에 남기지 않음
- 금지 : prod 직접 DDL·DML, `inspections`·`replacements` DELETE, DROP·TRUNCATE, main 직접 push, service_role 키 노출, `migration repair` 임의 실행

## 1. 사전 점검 (승인 불필요)

| # | 작업 | 기대값 |
|---|---|---|
| 1-1 | `git status -sb` · `git log --oneline -1` | 브랜치 `fix/life-km-first-mount`, HEAD에 이 지시서 커밋, 작업 폴더 깨끗함 |
| 1-2 | `git fetch origin` 후 `git merge-base --is-ancestor origin/main HEAD && echo OK` | `OK` (origin/main `c124f32` 이 조상) |
| 1-3 | `npm ci` · `npm run lint` · `npx tsc --noEmit -p tsconfig.app.json` · `npm test` | lint 오류 0, tsc 오류 0, vitest 18파일 121건 통과 |
| 1-4 | Docker 사용 가능하면 `supabase start` → `supabase test db` | t102·t104·t106 통과. Docker 없으면 「미실행」 표기 후 진행 |
| 1-5 | `supabase projects list` · `supabase migration list` | 링크된 프로젝트 ref `vndbzanhoumhhuneufni`. 원격 미적용 = 아래 6건뿐 |

미적용 예상 6건 (순서 고정)

- M-12 : `20261017100000_v_wear_pattern_null_guard.sql` · `20261017110000_single_zero_outlier_trigger.sql` · `20261017120000_v_tco_fleet_weighted.sql`
- M-13 : `20261104100000_v_tire_ledger_first_mount.sql` · `20261104110000_tire_config_life_end_basis.sql` · `20261104120000_dq_zero_tread_center_warn.sql`

`migration list` 결과가 이와 다르면(원격에만 있는 버전, 6건 외 미적용 등) 중지하고 보고.

## 2. 브랜치 push (승인 불필요 — main 아님)

```bash
git push -u origin fix/life-km-first-mount
```

- PR은 아직 만들지 않음. G3에서 처리

## 3. G1 — M-12 prod 반영 (승인 필요)

순서를 지키기 위해 M-12 는 PR #6 브랜치에서 적용 (그 브랜치에는 M-13 파일이 없음).

```bash
git switch feat/web-improvements-20261016      # origin 과 같은 5c4bef0 인지 확인
supabase db push --dry-run                     # 기대 : 20261017100000 · 110000 · 120000 3건만
```

- dry-run 결과를 보고하고 **멈춤**. 「G1 승인」 후 `supabase db push`
- 적용 후 검증 (읽기 전용, §6 접속 방법)

| 검증 | 기대값 |
|---|---|
| `select cpk_gross_wavg from v_tco_fleet` | 약 562.43 |
| `v_wear_pattern` 에서 outboard_avg NULL 인 행의 lateral_pattern | `'insufficient'` (종전 `'even'`), 대상 7행 |
| `select count(*) from tread_points where flag = 'OUTLIER' and flag_note like '%W-1%' and deleted_at is null` | 7 (변화 없음) |
| `supabase migration list` | 3건 원격 반영 |

## 4. G2 — M-13 prod 반영 (승인 필요)

```bash
git switch fix/life-km-first-mount
supabase db push --dry-run                     # 기대 : 20261104100000 · 110000 · 120000 3건만
```

- dry-run 결과를 보고하고 **멈춤**. 「G2 승인」 후 `supabase db push`
- 적용 후 즉시 검증

| 검증 | 기대값 |
|---|---|
| `select life_end_basis from tire_config` | `min` |
| `select reloptions from pg_class where relname in ('v_tire_ledger','v_data_quality')` | `security_invoker=on` 포함 |
| `select count(*) from v_tire_ledger where km_method = 'FIRST_NEW_INSPECTION'` | 1 이상 (값 기록) |
| `v_data_quality` 의 `zero_tread_unverified` severity 분포 | WARN·ERROR 건수 기록 (종전 ERROR 98건) |
| 의존 뷰 `v_tco_unit` · `v_tco_fleet` · `v_removal_analysis` 조회 | 오류 없음 |

## 5. 검증 — 17본 prod 대조 · 비교표 (승인 불필요, 읽기 전용)

### 5-1 17본 수용 표 (LIFE-KM 결과 §4)

- `docs/WO-TMS-2026-11-LIFE-KM_결과.md` §4 의 SELECT 실행 (G2 이후이므로 새 뷰로도 확인 : `v_tire_ledger` seq 0 `km_method`·`km_start`)
- 기대 : 17본 각각 「수정 후」 값 ±1 km, 평균 57,121 km
- 제외 3본 확인 : 02574D · 02689D 값 변화 없음, 03157D `NO_KM` 유지
- 불일치 본은 시리얼·기대값·실제값·원인 추정을 표로. CH 832 4본(04847D · 02472D · 07563D · 05096D)은 KM 중복 의심 건이라 별도 표기

### 5-2 수명 종료 기준 3종 비교표 (M-14 결정 자료)

- `npm run dev` → 로그인(쎄오님) → 수명 DB → 엑셀 다운로드 → 맨 뒤 「[비교] 예상 KM 최소 0mm / 3점 0mm / 4점 0mm」 3열 사용
- 표 : 장착 중 전 본 + 폐기 17본, 열 = 시리얼 · CH · 위치 · 주행 KM · min · three_zero · four_zero · 4점 회차 수
- 요약 : 기준별 평균·중앙값, 폐기 17본에서 각 기준 예상값 대 실제 주행 KM 오차율
- 엑셀 원본은 저장소에 커밋하지 않음 (보고서에는 표만)

### 5-3 M-15 신품 판정 22.0 vs 21.5

- LIFE-KM 결과 §6 SELECT 실행 → `new_at_22_0` · `new_at_21_5` · `diff_only_21_5` 기록

## 6. prod 읽기 접속 방법

```bash
# 읽기 전용 세션. 비밀번호는 프롬프트에서 쎄오님이 직접 입력
PGOPTIONS='-c default_transaction_read_only=on' \
psql "host=aws-1-ap-southeast-1.pooler.supabase.com port=5432 dbname=postgres user=postgres.vndbzanhoumhhuneufni sslmode=require"
```

- 세션 시작 직후 `show default_transaction_read_only;` → `on` 확인
- 접속이 안 되면 5-1·5-3 은 「미실행」, 5-2 엑셀 방식만 진행

## 7. G3 — 머지 (승인 필요)

- §3 ~ §5 결과 보고 후 **멈춤**. 「G3 승인」 후 진행
- 순서 : PR #6(`feat/web-improvements-20261016` → main) 머지 → `fix/life-km-first-mount` → main 새 PR 생성·머지
- 머지 방식 : merge commit (squash 금지 — 커밋별 Task 추적 유지)
- main 직접 push 금지. GitHub 웹 또는 `gh pr merge --merge`

## 8. G4 — 사이트 배포 (승인 필요)

- DB 반영(G1·G2) 이후에만 배포. 새 화면이 `cpk_*_wavg` · `life_end_basis` 를 읽으므로 순서 역전 금지
- 「G4 승인」 후

```bash
git switch main && git pull
npm ci && npm run lint && npm test
npm run deploy                                  # gh-pages
```

- 배포 확인 : https://hungaseo-arch.github.io/samtan/ 강력 새로고침 후
  - 원가 탭 CPK-G 카드 「가중평균」 표기, 값 약 562.43
  - 수명 DB 열 머리 「예상 KM (최소 0mm / 3점 0mm / 4점 0mm)」, 3 mm 명칭 「권장 교체」
  - 관리 › 판정 기준 › 「수명 종료 기준」 = 최소 0 mm
  - KO · ID 전환 시 반대 언어 노출 없음
  - 콘솔 오류 없음

## 9. 이상 시 대응

- `db push` 실패 : 재시도 금지. 오류 원문 보고. 마이그레이션은 트랜잭션 단위라 부분 적용 여부를 `migration list` 로 확인해 보고
- 적용 후 화면·뷰 오류 : 되돌리기 마이그레이션은 새 파일로 작성만 하고 적용은 쎄오님 승인 후 (뷰는 직전 정의 재생성, `life_end_basis` 열은 추가 열이라 유지)
- 배포 후 화면 오류 : `gh-pages` 직전 배포 커밋으로 되돌릴지 쎄오님께 질문

## 10. 범위 밖 (이번에 하지 않음)

- M-14 기본값 변경 (비교표 보고 후 쎄오님 결정)
- M-16 anon grant 회수 마이그레이션 (쎄오님 결정 대기)
- CH 847 · 832 · 835 KM 정정, 센터 0 현장 확인(M-6) — 현장 회신 후 별도 지시
- 단계 2 월간 리포트

## 11. 보고

- 게이트마다 채팅 보고 형식 : `G○ 대기 / 실행 명령 / dry-run·검증 결과 / 다음 단계`
- 최종 결과 : `docs/WO-TMS-2026-11-STEP1_결과.md` 작성 → `docs:` 커밋 → `git push origin fix/life-km-first-mount` (G3 이후면 main 반영 PR 에 포함하지 말고 별도 브랜치 `docs/step1-result` 로 push)
- 결과 문서 목차 : 0 결론 · 1 사전 점검 · 2 G1 · 3 G2 · 4 17본 대조표 · 5 기준 3종 비교표 · 6 M-15 · 7 머지·배포 · 8 미실행·이상 항목 · 9 쎄오님 결정 필요
- 집사가 origin 에서 결과 문서를 읽어 쎄오님께 최종 보고
- `docs/decisions.md` M-12 · M-13 상태를 「적용 (날짜)」로 갱신, `docs/사용설명서.md`·CHANGELOG 는 화면 변화 없으면 갱신 불필요
