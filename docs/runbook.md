# 런북 (Runbook) — 배포·롤백 절차

대상 프로젝트: Supabase `samtam` · 프론트엔드 정적 배포
최종 갱신: 2026-08-01 (T-001)

> **원칙**: 프로덕션 DB에 직접 DDL/DML을 실행하지 않습니다 (§3.1-1).
> 모든 스키마 변경은 `supabase/migrations/` 파일 → 로컬 검증 → 사용자 승인 → 적용 순서를 따릅니다.

---

## 1. 사전 준비 (최초 1회)

### 1.1 필수 도구

| 도구 | 확인 명령 | 현재 상태 (2026-08-01) |
|---|---|---|
| Supabase CLI | `supabase --version` | ✅ 2.101.0 |
| Docker Desktop | `docker info` | ✅ 29.6.2 |
| Node.js | `node --version` | ✅ |

### 1.2 Docker Desktop

`supabase start`(로컬 Postgres)와 `supabase db diff`/`db pull`은 Docker를 사용합니다.
Docker 없이는 로컬 검증이 불가능하며, §3.1-1이 금지하는 프로덕션 직접 적용 외에 대안이 없습니다.

```bash
brew install --cask docker      # 또는 https://www.docker.com/products/docker-desktop 에서 설치
open -a Docker                   # 최초 실행 후 권한 승인 필요
docker info                      # 정상 출력되면 준비 완료
```

### 1.3 프로젝트 링크

```bash
supabase link --project-ref <PROJECT_REF>   # ref는 Supabase 대시보드에서 확인. 저장소에 하드코딩 금지
supabase projects list                       # 링크 확인
```

링크 정보는 `supabase/.temp/linked-project.json`에 저장되며 `.gitignore` 대상입니다.

### 1.4 환경변수

`.env.example`을 `.env`로 복사한 뒤 실제 값을 채웁니다. **`.env`는 커밋하지 않습니다.**

| 키 | 용도 | 노출 범위 |
|---|---|---|
| `VITE_SUPABASE_URL` | 프로젝트 URL | 클라이언트 (공개 가능) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | publishable(anon) 키 | 클라이언트 (공개 가능) |

> `SUPABASE_SERVICE_ROLE_KEY`는 **절대** `.env`나 클라이언트 코드에 넣지 않습니다.
> RLS를 전면 무력화합니다. Edge Function 환경변수(`supabase secrets set`)로만 사용합니다 (§3.1-2).

---

## 2. 스키마 변경 배포

### 2.1 마이그레이션 작성

```bash
supabase migration new <설명>          # supabase/migrations/YYYYMMDDHHMMSS_설명.sql 생성
```

작성 규칙:
- **멱등하게**: `IF NOT EXISTS`, `ON CONFLICT DO UPDATE`, `CREATE OR REPLACE` (§3.2-1)
- **금지**: `DROP TABLE`, `TRUNCATE`, `ALTER TABLE ... DROP COLUMN` (§3.1-4)
- **금지**: `inspections`·`replacements` 레코드 `DELETE` — 소프트 삭제(`deleted_at`)만 (§3.1-3)

### 2.2 로컬 검증

```bash
supabase start                         # 로컬 Postgres 기동 (Docker 필요)
supabase db reset                      # 전체 마이그레이션을 처음부터 재적용
supabase test db                       # pgTAP 테스트 (supabase/tests/)
supabase stop                          # 종료
```

`db reset`이 실패하면 마이그레이션이 순서대로 재현되지 않는 것이므로 **적용하지 않습니다.**

### 2.3 스키마 동일성 확인

로컬이 프로덕션을 그대로 재현하는지 확인합니다. 마이그레이션을 추가하기 전 기준선 확인용입니다.

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -At -f docs/schema-parity.sql
# 같은 SQL 을 Supabase SQL Editor 에서 실행해 6개 해시가 모두 같은지 대조
```

`supabase db diff --linked --schema public`도 사용할 수 있으나, 함수 본문의 주석 차이만으로도
`CREATE OR REPLACE FUNCTION`을 출력하므로 그 자체로는 불일치의 근거가 되지 않습니다.

### 2.4 프로덕션 적용

**사용자 승인 후에만 실행합니다.**

> ⚠️ **현재 `supabase db push`를 사용하면 안 됩니다.** 로컬 `0001`~`0010`이 원격 이력에 기록되어 있지
> 않아, push 시 10개 전부가 프로덕션에 재실행됩니다. `0003`·`0004`의 일괄 `UPDATE`가 운영 중 수정된
> 값을 되돌릴 수 있습니다. 상세와 해소 방안은 `docs/decisions.md` U-1 참조.

```bash
supabase migration list                # 먼저 로컬/원격 이력 분기 여부 확인
supabase db push --dry-run             # 적용될 마이그레이션 목록 확인 (필수 선행)
supabase db push                       # 실제 적용 — U-1 해소 후에만
```

### 2.5 롤백

Supabase CLI에는 자동 다운 마이그레이션이 없습니다. 롤백은 **역방향 마이그레이션을 새로 작성**해 적용합니다.

```bash
supabase migration new revert_<원본설명>
# 원본의 역연산을 작성 — 단, DROP COLUMN/DROP TABLE은 §3.1-4에 따라 금지.
# 컬럼 추가의 롤백은 "사용 중단 + 주석 표기"로 처리하고 컬럼 자체는 남깁니다.
```

데이터 손상 시에는 Supabase Pro의 일 백업(PITR)에서 복구하고, 복구 사실을 `docs/decisions.md`에 기록합니다.

---

## 3. Edge Function 배포

```bash
supabase functions deploy <함수명>
supabase secrets set KEY=VALUE                    # 자격증명은 여기에만
supabase functions logs <함수명>                   # 배포 후 확인
```

현재 함수: `admin-users` (`supabase/functions/admin-users/`)

---

## 4. 프론트엔드 배포

```bash
npm run lint
npm run build                          # dist/ 생성
npm run deploy                         # GitHub Pages (VITE_BASE=/samtan/)
```

배포 대상: `https://hungaseo-arch.github.io/samtan`

> 작업지시서 §2.1은 호스팅을 **Cloudflare Pages**로 규정하나, 현재는 GitHub Pages(`gh-pages`)로 배포 중입니다.
> 이전 여부와 시점은 미결 사항입니다.

### 4.1 롤백

```bash
git revert <commit>                    # 소스 되돌리기
npm run deploy                         # 재배포
```

---

## 5. 배포 전 체크리스트

- [ ] `.env` / 서비스 롤 키가 커밋에 포함되지 않았는가 (`git diff --staged`로 확인)
- [ ] 마이그레이션이 `supabase db reset`으로 처음부터 재현되는가
- [ ] `supabase test db` 전체 통과하는가
- [ ] `npm run lint` 통과하는가
- [ ] 해당 Task의 완료 조건(DoD)이 항목별로 충족되었는가 (§3.2-2)
- [ ] `docs/schema.md`가 스키마 변경을 반영해 갱신되었는가
- [ ] 브랜치가 `main`이 아닌가 (§3.2-4)

---

## 6. 장애 대응

| 증상 | 확인 | 조치 |
|---|---|---|
| 로그인 후 쓰기가 안 됨 | `auth.users.app_metadata.role` 값 | 역할 미지정 계정은 `viewer`로 취급됨 (`0010`). 대시보드에서 역할 부여 후 **재로그인** 필요 |
| 마이그레이션 push 실패 | `supabase migration list` | 원격에만 있는 마이그레이션은 `supabase migration repair`로 이력 정합화 |
| `supabase start` 실패 | `docker info` | Docker Desktop 기동 확인 |
| 데이터 이상치 발견 | `docs/audit-report.md` | 임의 수정 금지. 사용자 확인 후 정정 마이그레이션 작성 (T-101) |
