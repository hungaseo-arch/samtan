# CONTRIBUTING

이 저장소에 변경을 넣을 때의 규칙입니다. 짧은 정본은 [CLAUDE.md](CLAUDE.md) 이고, 이 문서는 그 규칙을
**작업 순서**로 풀어 쓴 것입니다. 두 문서가 어긋나면 CLAUDE.md 와 작업지시서를 따르고 이 문서를 고치십시오.

## 1. 브랜치와 커밋

- `main` 에 직접 푸시하지 않습니다. 작업 브랜치(`phase-1/...`, `chore/...`, `feat/...`)에서 PR 로 합칩니다.
- 커밋은 Conventional Commits. 제목은 한국어로, 타입·스코프는 아래에서 고릅니다.
  - 타입: `feat` `fix` `perf` `refactor` `docs` `chore` `style` `test`
  - 스코프: `schema` `db` `data` `api` `web` `auth` `admin` `tco` `quality` `build` `deploy` `config`
  - 예: `feat(schema): 익명(anon) 읽기를 막고 로그인 사용자만 데이터를 읽게 한다`
- 본문에는 **왜** 바꿨는지를 씁니다. 무엇을 바꿨는지는 diff 가 말해 줍니다.
- Task 를 닫을 때는 완료 조건(DoD)을 항목별로 체크해 보고합니다. 미충족이면 다음 Task 로 넘어가지 않습니다.

## 2. 절대 금지 (요약)

1. 프로덕션 DB 에 직접 DDL/DML 실행 금지. MCP `apply_migration`·대시보드 SQL 편집기도 금지.
2. `SUPABASE_SERVICE_ROLE_KEY` 노출 금지 (클라이언트·저장소·로그).
3. `inspections` / `replacements` 하드 DELETE 금지. `deleted_at` 소프트 삭제만.
4. 마이그레이션에 `DROP TABLE` / `TRUNCATE` / `DROP COLUMN` 금지 (`vehicle_positions.serial2` 유지).
5. 원본 Excel 수정 금지. 환율·단가·계약 조건 임의 가정 금지.
6. 색상 하드코딩 금지 (`src/index.css` 의 CSS 변수 · 차트는 `src/lib/chartColors.ts`), `toLocaleString()` 직접 호출 금지 (`src/lib/format.ts`).

## 3. 스키마 변경 절차

```
supabase/migrations/YYYYMMDDHHMMSS_<주제>.sql 작성
  → supabase start
  → supabase db dump --linked -f prod_schema.sql   # 프로덕션 스키마 기준선 (파일은 커밋하지 말 것)
  → psql "$DB" -c 'drop schema public cascade; create schema public;' -f prod_schema.sql
  → psql "$DB" -f supabase/migrations/<새 파일>.sql   # 두 번 적용해 멱등성 확인
  → supabase test db                                 # pgTAP 전체 통과
  → PR · 사용자 승인
  → supabase db push --dry-run && supabase db push
```

`DB=postgresql://postgres:postgres@127.0.0.1:54322/postgres` 입니다.
`supabase db reset`(빈 DB 에서 전체 재생)은 **`20260827201000_backfill_tread_points.sql` 에서 멈춥니다** —
프로덕션 원장(엑셀 초기 적재, 마이그레이션이 아님)이 있다는 전제로 없으면 예외를 내는 데이터 백필이라
빈 DB 에서는 통과할 수 없습니다. 그래서 기준선은 위처럼 프로덕션 덤프로 잡습니다 (2026-09-06 확인).

- 파일명은 타임스탬프 14자리. `supabase db push` 만 사용합니다 — 다른 경로로 적용하면 원격 이력과 파일명이 어긋납니다 (2026-08-29 에 30건을 `migration repair` 로 정리한 전례).
- 멱등하게: `create ... if not exists`, `create or replace`, `drop policy if exists` 후 재생성, `on conflict do update`.
- 권한·정책을 바꾸면 `supabase/tests/` 에 pgTAP 를 함께 추가합니다 (`t105_rls_auth_only_test.sql` 참고).
  역할 시뮬레이션은 `set_config('request.jwt.claims', ...)` + `set local role authenticated`.
- 뷰는 `security_invoker = on`, 트리거 함수는 `security definer` + `set search_path = ''`. 새 함수는 PUBLIC EXECUTE 가
  붙지 않으므로 RPC 라면 `grant execute ... to authenticated, service_role` 을 명시합니다.
- 스키마가 바뀌면 `docs/schema.md` 를 같이 갱신합니다.

## 4. 프론트엔드 규칙

- **숫자 표기**는 CLAUDE.md 「숫자 표기」절이 정본입니다. 트레드 1자리, 공기압 정수, HM/KM 1자리, 천 단위 콤마는
  인도네시아어 화면도 동일. 전부 `src/lib/format.ts` 헬퍼로만 찍습니다.
- **임계치**는 `treadLevel()` / `treadThresholds()` / `recPsi()` (`src/data/tmsData.ts`) 를 경유합니다. 상수 금지.
- **로케일 3개**(`ko` / `id` / `en`)를 모두 채웁니다. `src/i18n/index.tsx` 사전에 키를 추가할 때 하나라도 비면
  그 화면만 언어가 튑니다. 용어는 CLAUDE.md 「용어」절을 따릅니다.
- **조회는 `src/api/*`** 에만 둡니다. 회차마다 늘어나는 조회(점검·측정점·시계열 뷰)는 반드시
  `fetchAll()` (`src/lib/supabase.ts`) 로 페이지를 끝까지 넘겨 받습니다. PostgREST 는 1,000행에서 **조용히** 자릅니다.
  마지막 `order` 키는 유일 키로 끝내 페이지 경계를 고정합니다.
- **쓰기는 RPC**(`upsert_inspection_round` 등)로만. 호출부는 `canWrite` / `canDelete` 로 게이팅하고 RLS 가 최종 방어선입니다.
- **애니메이션**은 CSS 클래스 `.stagger-in` / `.overlay-in` / `.modal-in` (`src/index.css`) 만 씁니다. 애니메이션 라이브러리를
  다시 들이지 않습니다.
- 타임존: 저장 UTC / 표시 `Asia/Jakarta`.
- 새 무거운 의존성은 `vite.config.ts` 의 `manualChunks` 로 갈라 두고 `chunkSizeWarningLimit`(500 kB) 경고를 지나치지 않습니다.

## 5. 검증

```bash
npm run typecheck
npm run lint
npm run build          # 청크 크기 경고 확인
supabase test db       # 스키마를 건드렸다면
```

## 6. PR 체크리스트

- [ ] `.env` · 서비스 롤 키가 diff 에 없다
- [ ] 마이그레이션이 프로덕션 덤프 위에서 두 번 적용되고(멱등) `supabase test db` 가 통과한다
- [ ] 새 UI 문구가 `ko` / `id` / `en` 세 곳에 다 있다
- [ ] 숫자는 `format.ts` 헬퍼, 색은 토큰, 임계치는 `treadLevel()` 경유
- [ ] `docs/schema.md` · `docs/사용설명서.md` · `CHANGELOG.md` 를 갱신했다
- [ ] 브랜치가 `main` 이 아니다
