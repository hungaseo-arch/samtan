# WO-TMS-2026-11-STEP1-FOLLOWUP — 단계 1 후속 : 결정 기록 · 권한 정리 · 설정 정리

- 작성 : 2026-11-08 · 집사(TMS 개선 총괄) → 실행 : 맥 VS Code Claude Code
- 근거 : 쎄오님 결정 2026-11-08 「1-8 권고대로」, `docs/WO-TMS-2026-11-STEP1.md`, `docs/WO-TMS-2026-11-LIFE-KM_결과.md` §9, 진행 기록 `~/tms-step1-progress.md`
- 기준 : origin/main `b0daae1` (G3 머지 · G4 배포 완료 상태)
- 작업 브랜치 : `docs/step1-result` (main 에서 생성)
- 원칙 : WO-TMS-2026-11-STEP1 §0 그대로 (승인 게이트 앞 멈춤, 기대값 불일치 시 중단, 수치 창작 금지, prod 는 읽기 전용 SELECT 만, Supabase MCP 쓰기 금지)

---

## 0. 쎄오님 결정 (2026-11-08) — decisions.md 에 그대로 기록

| # | 항목 | 결정 |
|---|---|---|
| 1 | M-14 수명 종료 기준 기본값 | `min` 확정 (DB 값 변경 없음). 근거 : 폐기 17본 실주행 대비 평균 오차 min +0.3% · three_zero +7.4% · four_zero +14.0%. four_zero 는 고객 리포트에서 「잠재 수명(참고)」 용도로만 검토 |
| 2 | LIFE-KM §9-4 회귀에 최소 0 회차 포함 | 사후 승인 (G2 로 반영된 현행 유지) |
| 3 | LIFE-KM §9-5 외삽 총량 `max(주행, 마지막 측정점 + 잔여)` | 사후 승인 |
| 4 | M-15 신품 판정 22.0 vs 21.5 | 22.0 유지, 종결 (21.5 허용 시 추가 0본) |
| 5 | LIFE-KM §9-6 첫 회차 tread_avg NULL 처리 | 보류. 먼저 §2 조사 |
| 6 | M-16 v_tire_ledger anon grant | 회수 진행 (§3) |
| 7 | config.toml CLI 3.0 구 키 | 정리 진행 (§4) |
| 8 | 머지된 원격 브랜치 | 삭제 진행 (§5) |

## 1. 결과 문서 · decisions 갱신 (승인 불필요)

- `docs/WO-TMS-2026-11-STEP1_결과.md` 작성 : 진행 기록(`~/tms-step1-progress.md`)을 정리. 목차는 STEP1 §11 그대로, §5-2 비교표는 요약표 + 폐기 17본 표만(장착 중 67본 표는 부록)
- `docs/decisions.md`
  - M-12 · M-13 : 「적용 (2026-11-08, 쎄오님 터미널 `supabase db push --remote --yes`)」
  - M-14 · M-15 : §0 결정대로 해소 처리, M-16 : §3 결과로 갱신
  - L-8 에 기본값 확정 근거 한 줄
- 「현장 확인 필요」 절 신설 또는 갱신 : 삼탄 7대 밖 Install 15본, 같은 위치 다중 장착 3곳(824 R3 Out · 835 R3 In · 849 R3 Out), CH 847 예상 KM 과대(M-1 연동)
- CHANGELOG : 2026-11-08 배포 항목
- `docs/WO-TMS-2026-11-STEP1-FOLLOWUP.md` : 이 지시서를 저장소에 반입 (`scp seo@187.124.141.33:/home/seo/tms-handoff/WO-TMS-2026-11-STEP1-FOLLOWUP.md docs/`)
- 커밋 : `docs: WO-TMS-2026-11-STEP1 결과 보고 · decisions M-12~M-16 · 쎄오님 결정 2026-11-08`

## 2. 조사 — 시작점 추론 미적용 10본 (읽기 전용, 승인 불필요)

- 배경 : M-15 SELECT 후보 70본 중 `v_tire_ledger.km_method = 'FIRST_NEW_INSPECTION'` 60본 → 10본 차이
- 산출 : 10본 각각 시리얼 · CH · 위치 · 첫 회차 날짜 · 첫 회차 tread_avg · 첫 회차 차량 km 유무 · 원장 seq 0 의 km_method · km_flag · 미적용 사유 분류
- 사유 분류 예 : 첫 회차 km 없음(CH 849 형) / 첫 회차 tread_avg NULL / seq 0 이 아님 / 장착일(mounted_at) 있음 / 기타
- 「첫 회차 tread_avg NULL」 본수가 몇인지가 결정 5 의 판단 자료. 수정·제안 구현 없이 표만
- 결과 문서 부록에 기록

## 3. M-16 anon grant 회수 (G5 승인 필요)

### 3-1 조사 (읽기 전용)
```sql
select table_schema, table_name, privilege_type
  from information_schema.role_table_grants
 where grantee = 'anon' and table_schema in ('public', 'finance')
 order by 1, 2, 3;
```
- 기대 : `v_tire_ledger` select 1건. 그 외 객체가 나오면 **목록만 보고하고 멈춤** (회수 범위는 쎄오님 확인 후)

### 3-2 마이그레이션 (기대대로 1건일 때)
- 파일 : `supabase/migrations/20261108100000_revoke_anon_v_tire_ledger.sql`
- 내용 : `revoke all on public.v_tire_ledger from anon;` + 사유 주석(M-16, 20261016150000 이 재부여한 것 회수). 멱등(재실행 무해)
- 금지 : authenticated 권한·뷰 정의·reloptions 변경
- pgTAP `supabase/tests/t108_anon_revoke_test.sql` : `has_table_privilege('anon', 'public.v_tire_ledger', 'select')` = false, authenticated = true
- 검증 : `scripts/local-pglite-check.mjs` 로 마이그레이션 전체 + 신규 2회 적용, t102 · t104 · t106 · t107 · t108 실행
- 커밋 : `feat(schema): M-16 v_tire_ledger anon grant 회수`

### 3-3 G5 — prod 반영
- Claude Code 는 prod 명령 실행 금지. 쎄오님 터미널에서 실행 :
  1. `supabase db push --remote --dry-run 2>&1 | tee ~/g5-dry.txt` → scp → 기대 : `20261108100000` 1건만
  2. 집사 확인 후 `supabase db push --remote --yes 2>&1 | tee ~/g5.txt` → scp
- 적용 후 검증 (읽기 전용) : 원격 이력 70건, 3-1 SELECT 결과 0건, `has_table_privilege('anon', …)` false, 로그인 화면에서 수명 DB 정상 조회는 쎄오님 확인

## 4. config.toml CLI 3.0 구 키 정리 (승인 불필요 — 로컬 설정)

- CLI 경고 문구 기준으로 교체 : `[auth.email] enable_signup` → `enabled`, `[auth.sms] enable_signup` → `enabled`, `[experimental] orioledb_version` → `[db] orioledb_version`
- 값은 그대로 유지. `[experimental.pgdelta]` 등 신규 키는 추가하지 않음
- 확인 : CLI 경고 2줄이 사라지는지는 §3-3 dry-run 출력으로 확인 (사라지지 않으면 보고)
- 의미가 달라질 수 있는 키(예 : 3.0 의 `enabled` 가 가입 허용이 아니라 제공자 활성 의미인 경우)는 CLI 3.0 문서·템플릿 주석으로 확인 후, 의미가 다르면 바꾸지 말고 보고
- 커밋 : `chore(supabase): CLI 3.0 config 구 키 정리 (enable_signup · orioledb_version)`

## 5. 머지된 원격 브랜치 삭제 (승인 불필요 — 쎄오님 결정 8)

- 대상 2개만 : `feat/web-improvements-20261016` · `fix/life-km-first-mount`
- 사전 확인 : 각 브랜치 HEAD 가 `git merge-base --is-ancestor <branch> origin/main` 통과
- `git push origin --delete <branch>` 후 로컬도 `git branch -d` (`-D` 금지)
- 다른 머지된 브랜치(feat/life-km-correction · feat/wear-fleet-average · feat/wear-km-per-mm 등)는 삭제하지 않고 목록만 보고

## 6. PR · G6 머지

- `git push -u origin docs/step1-result` → PR 생성(base main), 본문 : §0 결정표 · §2 요약 · §3 · §4 · §5 결과
- **G6 머지 승인 필요** — G5 적용·검증 후에만. merge commit (squash 금지)
- 웹 코드 변경이 없으므로 배포 불필요. 화면에 영향 있는 변경이 섞이면 보고

## 7. 순서 · 보고

1. §1 → §2 → §3-1 → §3-2 → §4 → §5 → §6 PR 생성 → **G5 대기** → (쎄오님 적용) → §3-3 검증 → **G6 대기**
2. 게이트마다 `~/tms-step1-progress.md` 에 이어 쓰고 `scp ~/tms-step1-progress.md seo@187.124.141.33:/home/seo/tms-handoff/STEP1_진행.md`
3. 비밀번호 · 키는 파일에 쓰지 않음

## 8. 범위 밖

- Irawan 앞 현장 확인 요청 발송 (집사가 초안, 발송은 쎄오님 승인)
- 결정 5 구현, 단계 2 월간 리포트
