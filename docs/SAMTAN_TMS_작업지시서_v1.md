# Samtan TMS 데이터 정합성 개선 작업지시서 (v1)

> **대상**: VSCode Claude Code
> **작성일**: 2026-08-26 · **작성**: PT Ascendo Internasional
> **근거 문서**: `claude/verifikasi_riwayat_ban_20260826.md` (프로젝트 "개발-Samtan_TMS")
> **범위**: 개선안 6개 항목 전부

---

## 0. 배경

Techking 현장(Bpk. Irawan)이 2026-08-18 보고한 "타이어 이력이 조회되지 않는다"는 문제의 원인은 **세 테이블이 각자 진실을 들고 있고, 이를 맞춰 주는 것이 트리거가 아니라 사람이 작성하는 SQL 한 줄**이라는 구조에 있다. 2026-08-26 데이터 자체는 수기로 복구(`lifetimes` 70 → 95행)했으나, 같은 사고가 다음 달에도 반복된다.

이 지시서는 그 구조를 고치는 작업이다. **데이터 복구는 이미 끝났으므로 다시 하지 말 것.**

### 해결해야 할 6개 항목

| # | 항목 | As-Is | To-Be | 난이도 |
|---|------|-------|-------|--------|
| 1 | 타이어 마스터 등록 | 원장 엑셀 수동 이관 | `replacements` INSERT 트리거로 `lifetimes` 자동 생성 | 낮음 |
| 2 | 위치별 시리얼 보관 | `serial` + `serial2` 2칸 | `replacements` 단일 진실원 + `v_current_tire` 뷰 | 중간 |
| 3 | 교체→현재 시리얼 반영 | 수동 UPDATE | 트리거 자동 동기화 | 낮음 |
| 4 | 탈거 타이어 상태 | 수동 | 교체 시 구 시리얼 자동 `Spare` 전환 | 낮음 |
| 5 | 상세 조회 방식 | `lifetimes` 없으면 빈 화면 | `inspections`·`replacements` 기반 대체 표시 + 미등록 배지 | 낮음 |
| 6 | 정합성 감시 | 없음 | 체크 뷰/RPC + 대시보드 배지 | 중간 |

---

## 1. 환경 정보

### 1.1 데이터베이스

- **Supabase 프로젝트**: `samtam` / project_id **`vndbzanhoumhhuneufni`** / PostgreSQL 17
- **적용 방식**: Supabase MCP **`apply_migration`** (원격 프로젝트 직접 적용). 로컬 `supabase db push` 사용하지 않는다.
- **마이그레이션 명명**: 기존 이력이 `migration:20260801100000` 형식 → **`YYYYMMDDHHMMSS_<snake_case_name>`** 을 따른다.
- 읽기 전용 확인은 `execute_sql`, DDL은 반드시 `apply_migration` 을 쓴다.

### 1.2 테이블 현황 (2026-08-26 기준)

| 테이블 | 행 수 | PK | 비고 |
|---|---|---|---|
| `vehicles` | 7 | `ch` | ch = `'824'`,`'832'`,`'834'`,`'835'`,`'839'`,`'847'`,`'849'` (문자열, 접두어 없음) |
| `vehicle_positions` | 70 | `(ch,pos)` | `serial`=최초 장착, `serial2`=최신 교체분. **2칸 한도가 항목 2의 원인** |
| `replacements` | 19 | `id` uuid | `(ch,pos,date,new_serial)`. FK → `vehicle_positions(ch,pos)` |
| `inspections` | 410 | `id` uuid | FK → `vehicle_positions(ch,pos)` |
| `lifetimes` | 95 | `no` int | **트리거 0개, 감사 컬럼 0개.** `install`·`scrap` 이 `text`(`'YYYY-MM-DD'`), `lifetime` 은 numeric(일수) |
| `tire_config` | 1 | `id`(=1) | 신품 트레드·권장 공기압·경고 임계값 |
| `damage_codes` | 14 | `code` | `CD`=Crown Damage 등 |
| `audit_log` | 288+ | `id` bigint | `log_audit()` 트리거가 적재 |

`pos` 값 10종: `L1, L2 In, L2 Out, L3 In, L3 Out, R1, R2 In, R2 Out, R3 In, R3 Out`

### 1.3 지켜야 할 기존 규약

기존 테이블 트리거 세트 (이 패턴을 벗어나지 말 것):

```
trg_<t>_audit          BEFORE INSERT OR UPDATE  → set_audit_fields()
trg_<t>_updated_at     BEFORE UPDATE            → set_updated_at()
trg_<t>_guard_delete   BEFORE UPDATE            → guard_soft_delete()   -- inspections, replacements 만
trg_<t>_no_delete      BEFORE DELETE            → forbid_hard_delete()  -- inspections, replacements 만
trg_<t>_log            AFTER  I/U/D             → log_audit('<pk...>')
```

- `set_audit_fields()` 는 `auth.uid()` / `auth.jwt()->>'email'` 을 쓴다. **트리거 내부에서 발생하는 2차 UPDATE 에서도 동일하게 동작**하므로 별도 처리 불필요.
- **소프트 삭제 원칙**: `inspections`·`replacements` 는 하드 삭제 금지. 모든 조회 로직에 `deleted_at IS NULL` 을 반드시 넣는다.
- **RLS**: 전 테이블 활성. `SELECT` 는 `public` 전체 허용(`using true`), 쓰기는 `app_role() IN ('inspector','admin')`, `DELETE` 는 `admin`.
- 새로 만드는 **뷰는 반드시 `security_invoker = on`** 으로 설정하고 `anon, authenticated` 에 `SELECT` 를 부여한다.

---

## 2. 작업 원칙

1. **Phase 순서를 지킨다.** Phase 0 → 1 → 2 → 3. 각 Phase 끝의 검증 게이트를 통과하지 못하면 다음으로 넘어가지 않는다.
2. **데이터를 고치지 않는다.** 이 작업은 스키마·로직 작업이다. `lifetimes` 95행, `vehicle_positions` 70행의 현재 값은 검증된 상태다. 트리거 도입으로 기존 행이 바뀌면 **버그**다.
3. **컬럼을 지우지 않는다.** 항목 2에서도 `vehicle_positions.serial2` 는 **삭제하지 않는다.** 뷰를 추가하고 트리거로 계속 동기화해 무중단으로 전환한다. 컬럼 주석에 deprecated 표기만 남긴다.
4. **각 마이그레이션은 되돌릴 수 있어야 한다.** 마이그레이션 파일 하단에 `-- ROLLBACK:` 주석으로 역DDL을 반드시 적는다.
5. **멱등성**: `CREATE OR REPLACE`, `IF NOT EXISTS`, `DROP TRIGGER IF EXISTS` 를 사용해 재실행해도 안전하게 만든다.
6. 진행 중 판단이 필요한 지점은 임의로 정하지 말고 **작업을 멈추고 질문한다.**

---

## Phase 0 · 저장소 파악

프론트엔드 스택은 확인되지 않았다. 다음을 먼저 조사하고 **결과를 요약 보고한 뒤** Phase 1로 넘어간다.

- [ ] 저장소 루트 구조, 패키지 매니저, 빌드 도구 (`package.json`, `vite.config.*`, `next.config.*` 등)
- [ ] Supabase 클라이언트 초기화 위치와 사용 패턴 (`createClient`, `.from()`, `.rpc()`)
- [ ] `vehicle_positions`, `serial2`, `lifetimes`, `replacements` 문자열을 **전 코드에서 검색**하고 참조 파일 목록화
- [ ] 이미지에 보이는 두 화면의 소스 파일 특정
  - **차량 레이아웃 화면** — 상단 `Unit(CH)` 탭, `TATA LETAK ROAD TRAIN`, Head/Trailer/Dolly 포지션 박스
  - **타이어 상세 카드** — `#10 · R3 Out`, `Tekanan rekomendasi`, `Serial A → B`, `Klik → lihat DB umur`, `Tren tapak (mm)` / `Tren tekanan (psi)` 차트
- [ ] `Klik → lihat DB umur` 클릭 시 어떤 쿼리가 나가는지 (= 항목 5에서 고쳐야 할 지점)
- [ ] 기존 마이그레이션 디렉터리 존재 여부 (`supabase/migrations/`). 있으면 파일도 함께 생성해 이력을 남긴다.
- [ ] i18n 여부. UI 문자열은 **인도네시아어**가 기본이다 (현장 사용자가 Techking 직원).

> **게이트 0**: 위 목록과 "어느 파일을 고칠 것인지"를 보고할 것.

---

## Phase 1 · DB 마이그레이션

### M1 — `lifetimes` 기반 정비 (항목 1 준비)

**마이그레이션명**: `<타임스탬프>_lifetimes_hardening`

목적: `lifetimes` 에 자동 INSERT를 걸기 전에 무결성 장치와 기존 규약을 갖춘다.

```sql
-- 1) serial 유일성 (사전 확인 완료: 95행 / distinct 95 / NULL 0)
CREATE UNIQUE INDEX IF NOT EXISTS lifetimes_serial_uniq
  ON public.lifetimes (serial) WHERE serial IS NOT NULL;

-- 2) no 자동 채번 (현재 수동 입력)
CREATE SEQUENCE IF NOT EXISTS public.lifetimes_no_seq OWNED BY public.lifetimes.no;
SELECT setval('public.lifetimes_no_seq', COALESCE((SELECT MAX(no) FROM public.lifetimes), 0), true);
ALTER TABLE public.lifetimes ALTER COLUMN no SET DEFAULT nextval('public.lifetimes_no_seq');

-- 3) 상태 값 통제 (현재 사용 값: Install / Spare / Not Install / Scrap)
ALTER TABLE public.lifetimes
  ADD CONSTRAINT lifetimes_status_chk
  CHECK (status IS NULL OR status IN ('Install','Spare','Not Install','Scrap'));

-- 4) 다른 테이블과 동일한 감사 규약 부여
ALTER TABLE public.lifetimes
  ADD COLUMN IF NOT EXISTS created_at       timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at       timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS created_by       uuid,
  ADD COLUMN IF NOT EXISTS updated_by       uuid,
  ADD COLUMN IF NOT EXISTS created_by_email text,
  ADD COLUMN IF NOT EXISTS updated_by_email text;

DROP TRIGGER IF EXISTS trg_lifetimes_audit      ON public.lifetimes;
DROP TRIGGER IF EXISTS trg_lifetimes_updated_at ON public.lifetimes;
DROP TRIGGER IF EXISTS trg_lifetimes_log        ON public.lifetimes;

CREATE TRIGGER trg_lifetimes_audit      BEFORE INSERT OR UPDATE ON public.lifetimes
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();
CREATE TRIGGER trg_lifetimes_updated_at BEFORE UPDATE ON public.lifetimes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_lifetimes_log        AFTER INSERT OR UPDATE OR DELETE ON public.lifetimes
  FOR EACH ROW EXECUTE FUNCTION public.log_audit('no');

COMMENT ON COLUMN public.lifetimes.install IS
  'Tgl pasang awal — 신품 최초 투입일. 로테이션으로 위치가 바뀌어도 갱신하지 않는다.';
```

> ⚠️ 3) CHECK 제약은 기존 95행이 통과하는지 먼저 `execute_sql` 로 확인한 뒤 추가한다.
> ⚠️ 4) 컬럼 추가 전 `pg_get_functiondef` 로 `set_audit_fields()` 가 요구하는 컬럼명과 정확히 일치하는지 대조한다.

### M2 — 조회 뷰 5종 (항목 2·5·6의 토대)

**마이그레이션명**: `<타임스탬프>_tire_views`

```sql
-- (1) 포지션별 현재 장착 타이어 — serial/serial2 2칸 구조를 대체하는 정본
CREATE OR REPLACE VIEW public.v_current_tire AS
SELECT
  vp.ch,
  vp.pos,
  vp.seq,
  COALESCE(r.new_serial, vp.serial)      AS serial,
  vp.serial                              AS serial_initial,
  r.new_serial                           AS serial_latest_repl,
  r.date                                 AS mounted_at,
  COALESCE(rc.cnt, 0)::int               AS repl_count
FROM public.vehicle_positions vp
LEFT JOIN LATERAL (
  SELECT r2.new_serial, r2.date
    FROM public.replacements r2
   WHERE r2.ch = vp.ch AND r2.pos = vp.pos AND r2.deleted_at IS NULL
   ORDER BY r2.date DESC, r2.created_at DESC
   LIMIT 1
) r ON TRUE
LEFT JOIN LATERAL (
  SELECT count(*) AS cnt
    FROM public.replacements r3
   WHERE r3.ch = vp.ch AND r3.pos = vp.pos AND r3.deleted_at IS NULL
) rc ON TRUE
WHERE vp.deleted_at IS NULL;

-- (2) 포지션별 전체 시리얼 이력 — 교체 횟수 무제한
CREATE OR REPLACE VIEW public.v_position_history AS
SELECT vp.ch, vp.pos, 0 AS seq_no, vp.serial AS serial,
       NULL::date AS mounted_at, 'initial'::text AS source
  FROM public.vehicle_positions vp
 WHERE vp.deleted_at IS NULL AND vp.serial IS NOT NULL
UNION ALL
SELECT r.ch, r.pos,
       row_number() OVER (PARTITION BY r.ch, r.pos ORDER BY r.date, r.created_at)::int,
       r.new_serial, r.date, 'replacement'
  FROM public.replacements r
 WHERE r.deleted_at IS NULL AND r.new_serial IS NOT NULL;

-- (3) 시리얼별 장착 구간 — 언제 어디에 붙어 있었나
CREATE OR REPLACE VIEW public.v_tire_mount_history AS
SELECT h.serial, h.ch, h.pos, h.seq_no,
       h.mounted_at,
       lead(h.mounted_at) OVER (PARTITION BY h.ch, h.pos ORDER BY h.seq_no) AS removed_at,
       (lead(h.mounted_at) OVER (PARTITION BY h.ch, h.pos ORDER BY h.seq_no) IS NULL) AS is_current
  FROM public.v_position_history h;

-- (4) 타이어 상세 조회 단일 소스 — lifetimes 미등록이어도 행이 나온다 (항목 5)
CREATE OR REPLACE VIEW public.v_tire_detail AS
WITH sn AS (
  SELECT DISTINCT serial FROM public.v_position_history WHERE serial IS NOT NULL
  UNION
  SELECT serial FROM public.lifetimes WHERE serial IS NOT NULL
  UNION
  SELECT serial FROM public.inspections WHERE serial IS NOT NULL AND deleted_at IS NULL
)
SELECT
  sn.serial,
  (l.no IS NOT NULL)                       AS is_registered,   -- false → UI 에 미등록 배지
  l.no                                     AS lifetime_no,
  l.install                                AS install_date,
  l.scrap                                  AS scrap_date,
  l.damage                                 AS damage_code,
  l.lifetime                               AS lifetime_days,
  COALESCE(l.status, CASE WHEN cur.ch IS NOT NULL THEN 'Install' ELSE NULL END) AS status,
  l.note                                   AS note,
  cur.ch                                   AS current_ch,
  cur.pos                                  AS current_pos,
  cur.mounted_at                           AS current_mounted_at,
  ins.first_inspection,
  ins.last_inspection,
  ins.inspection_count,
  ins.last_tread,
  ins.last_pressure
FROM sn
LEFT JOIN public.lifetimes l ON l.serial = sn.serial
LEFT JOIN LATERAL (
  SELECT m.ch, m.pos, m.mounted_at
    FROM public.v_tire_mount_history m
   WHERE m.serial = sn.serial AND m.is_current
   ORDER BY m.mounted_at DESC NULLS LAST
   LIMIT 1
) cur ON TRUE
LEFT JOIN LATERAL (
  SELECT min(i.inspection_date) AS first_inspection,
         max(i.inspection_date) AS last_inspection,
         count(*)::int          AS inspection_count,
         (array_agg(i.tread    ORDER BY i.inspection_date DESC))[1] AS last_tread,
         (array_agg(i.pressure ORDER BY i.inspection_date DESC))[1] AS last_pressure
    FROM public.inspections i
   WHERE i.serial = sn.serial AND i.deleted_at IS NULL
) ins ON TRUE;

-- (5) 정합성 감시 (항목 6)
CREATE OR REPLACE VIEW public.v_data_integrity AS
SELECT 'missing_lifetime'::text AS check_key,
       'error'::text            AS severity,
       count(*)::int            AS cnt,
       coalesce(jsonb_agg(jsonb_build_object('ch',t.ch,'pos',t.pos,'serial',t.serial)), '[]'::jsonb) AS detail
  FROM public.v_current_tire t
 WHERE NOT EXISTS (SELECT 1 FROM public.lifetimes l WHERE l.serial = t.serial)
UNION ALL
SELECT 'serial2_out_of_sync', 'error', count(*)::int,
       coalesce(jsonb_agg(jsonb_build_object('ch',t.ch,'pos',t.pos,
              'expected',t.serial,'actual',vp.serial2)), '[]'::jsonb)
  FROM public.v_current_tire t
  JOIN public.vehicle_positions vp ON vp.ch = t.ch AND vp.pos = t.pos
 WHERE t.repl_count > 0 AND vp.serial2 IS DISTINCT FROM t.serial_latest_repl
UNION ALL
SELECT 'install_but_unmounted', 'warning', count(*)::int,
       coalesce(jsonb_agg(jsonb_build_object('no',l.no,'serial',l.serial)), '[]'::jsonb)
  FROM public.lifetimes l
 WHERE l.status = 'Install' AND l.note IS NULL
   AND NOT EXISTS (SELECT 1 FROM public.v_current_tire t WHERE t.serial = l.serial)
UNION ALL
SELECT 'mounted_but_not_install', 'warning', count(*)::int,
       coalesce(jsonb_agg(jsonb_build_object('no',l.no,'serial',l.serial,
              'status',l.status,'ch',t.ch,'pos',t.pos)), '[]'::jsonb)
  FROM public.v_current_tire t
  JOIN public.lifetimes l ON l.serial = t.serial
 WHERE l.status IS DISTINCT FROM 'Install'
UNION ALL
SELECT 'position_over_2_serials', 'info', count(*)::int,
       coalesce(jsonb_agg(jsonb_build_object('ch',t.ch,'pos',t.pos,'repl_count',t.repl_count)), '[]'::jsonb)
  FROM public.v_current_tire t
 WHERE t.repl_count >= 2;

-- 권한
ALTER VIEW public.v_current_tire       SET (security_invoker = on);
ALTER VIEW public.v_position_history   SET (security_invoker = on);
ALTER VIEW public.v_tire_mount_history SET (security_invoker = on);
ALTER VIEW public.v_tire_detail        SET (security_invoker = on);
ALTER VIEW public.v_data_integrity     SET (security_invoker = on);

GRANT SELECT ON public.v_current_tire, public.v_position_history,
                public.v_tire_mount_history, public.v_tire_detail,
                public.v_data_integrity
   TO anon, authenticated;
```

> **M2 기대 결과 (반드시 확인)**
> - `SELECT count(*) FROM v_current_tire` → **70**
> - `v_current_tire` 의 `serial` 이 `vehicle_positions` 의 `COALESCE(serial2, serial)` 와 **70/70 일치**
> - `v_data_integrity` 에서 `missing_lifetime = 0`, `serial2_out_of_sync = 0`
> - `install_but_unmounted = 2` (원장 오류 no.20 `DA1BFANH05095D`, no.72 `DA1BFBPH02426D` — **Techking 회신 대기 중인 정상 상태**)
> - `position_over_2_serials = 2` (`CH 835 L3 Out`, `CH 849 R2 In`)

### M3 — 동기화·자동생성 트리거 (항목 1·3·4)

**마이그레이션명**: `<타임스탬프>_replacement_triggers`

```sql
-- (A) 항목 3 : replacements → vehicle_positions.serial2 자동 동기화
CREATE OR REPLACE FUNCTION public.sync_position_current_serial()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_ch text; v_pos text; v_latest text;
BEGIN
  v_ch  := COALESCE(NEW.ch,  OLD.ch);
  v_pos := COALESCE(NEW.pos, OLD.pos);

  SELECT r.new_serial INTO v_latest
    FROM public.replacements r
   WHERE r.ch = v_ch AND r.pos = v_pos AND r.deleted_at IS NULL
   ORDER BY r.date DESC, r.created_at DESC
   LIMIT 1;

  UPDATE public.vehicle_positions vp
     SET serial2 = v_latest
   WHERE vp.ch = v_ch AND vp.pos = v_pos
     AND vp.serial2 IS DISTINCT FROM v_latest;

  RETURN NULL;
END $$;

-- (B) 항목 1 : 신규 시리얼의 lifetimes 행 자동 생성
CREATE OR REPLACE FUNCTION public.ensure_lifetime_row()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_serial text; v_date date;
BEGIN
  IF TG_TABLE_NAME = 'replacements' THEN
    v_serial := NEW.new_serial;
    v_date   := NEW.date;
  ELSE  -- vehicle_positions
    v_serial := COALESCE(NEW.serial2, NEW.serial);
    v_date   := CURRENT_DATE;
  END IF;

  IF v_serial IS NULL THEN RETURN NULL; END IF;

  INSERT INTO public.lifetimes (serial, install, status, note)
  VALUES (v_serial, to_char(v_date, 'YYYY-MM-DD'), 'Install', NULL)
  ON CONFLICT (serial) DO NOTHING;   -- lifetimes_serial_uniq

  RETURN NULL;
END $$;

-- (C) 항목 4 : 교체로 탈거된 구 시리얼을 Spare 로 전환
CREATE OR REPLACE FUNCTION public.retire_previous_tire()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_prev text;
BEGIN
  -- 직전 시리얼 = 이 교체보다 앞선 최신 교체분, 없으면 최초 장착 시리얼
  SELECT r.new_serial INTO v_prev
    FROM public.replacements r
   WHERE r.ch = NEW.ch AND r.pos = NEW.pos AND r.deleted_at IS NULL
     AND r.id <> NEW.id
     AND (r.date < NEW.date OR (r.date = NEW.date AND r.created_at < NEW.created_at))
   ORDER BY r.date DESC, r.created_at DESC
   LIMIT 1;

  IF v_prev IS NULL THEN
    SELECT vp.serial INTO v_prev
      FROM public.vehicle_positions vp
     WHERE vp.ch = NEW.ch AND vp.pos = NEW.pos;
  END IF;

  IF v_prev IS NULL OR v_prev = NEW.new_serial THEN RETURN NULL; END IF;

  -- 로테이션 대비: 다른 포지션에 장착돼 있으면 건드리지 않는다
  IF EXISTS (SELECT 1 FROM public.v_current_tire t WHERE t.serial = v_prev) THEN
    RETURN NULL;
  END IF;

  UPDATE public.lifetimes
     SET status = 'Spare'
   WHERE serial = v_prev
     AND status = 'Install';   -- Scrap / Not Install 은 덮어쓰지 않는다

  RETURN NULL;
END $$;

-- 트리거 등록 (이름 알파벳 순 = 실행 순서. ensure → retire → sync 순으로 돈다)
DROP TRIGGER IF EXISTS trg_replacements_a_ensure_lifetime ON public.replacements;
DROP TRIGGER IF EXISTS trg_replacements_b_retire_prev     ON public.replacements;
DROP TRIGGER IF EXISTS trg_replacements_c_sync_position   ON public.replacements;

CREATE TRIGGER trg_replacements_a_ensure_lifetime
  AFTER INSERT OR UPDATE ON public.replacements
  FOR EACH ROW EXECUTE FUNCTION public.ensure_lifetime_row();

CREATE TRIGGER trg_replacements_b_retire_prev
  AFTER INSERT ON public.replacements
  FOR EACH ROW EXECUTE FUNCTION public.retire_previous_tire();

CREATE TRIGGER trg_replacements_c_sync_position
  AFTER INSERT OR UPDATE OR DELETE ON public.replacements
  FOR EACH ROW EXECUTE FUNCTION public.sync_position_current_serial();

-- 신규 차량 등록 시에도 lifetimes 확보
DROP TRIGGER IF EXISTS trg_vehicle_positions_ensure_lifetime ON public.vehicle_positions;
CREATE TRIGGER trg_vehicle_positions_ensure_lifetime
  AFTER INSERT ON public.vehicle_positions
  FOR EACH ROW EXECUTE FUNCTION public.ensure_lifetime_row();

COMMENT ON COLUMN public.vehicle_positions.serial2 IS
  'DEPRECATED — trg_replacements_c_sync_position 이 자동 유지하는 캐시 컬럼. 신규 코드는 v_current_tire.serial 을 사용할 것.';
```

> **트리거 실행 순서가 중요하다.** `retire_previous_tire()` 는 `v_current_tire` 를 읽어 "다른 곳에 장착되었는지"를 판단하는데, `sync_position_current_serial()` 이 먼저 돌면 판단 근거가 흐트러진다. 그래서 트리거명에 `a_/b_/c_` 접두어를 붙여 순서를 고정한다. **이름을 바꾸지 말 것.**

### M4 — 정합성 점검 RPC (항목 6)

**마이그레이션명**: `<타임스탬프>_integrity_rpc`

```sql
CREATE OR REPLACE FUNCTION public.check_data_integrity()
RETURNS TABLE (check_key text, severity text, cnt int, detail jsonb)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$ SELECT check_key, severity, cnt, detail FROM public.v_data_integrity ORDER BY severity, check_key $$;

GRANT EXECUTE ON FUNCTION public.check_data_integrity() TO anon, authenticated;
```

### 게이트 1 — Phase 1 검증

아래를 `execute_sql` 로 실행하고 결과를 **표로 보고**한다.

```sql
-- (1) 기존 데이터 무변경 확인 : 트리거 도입으로 값이 바뀌면 안 된다
SELECT (SELECT count(*) FROM lifetimes)                                   AS lifetimes_rows,     -- 기대 95
       (SELECT count(*) FROM vehicle_positions WHERE deleted_at IS NULL)  AS positions,          -- 기대 70
       (SELECT count(*) FROM replacements WHERE deleted_at IS NULL)       AS replacements,       -- 기대 19
       (SELECT count(*) FROM lifetimes WHERE status='Install')            AS st_install,         -- 기대 87
       (SELECT count(*) FROM lifetimes WHERE status='Spare')              AS st_spare,           -- 기대 5
       (SELECT count(*) FROM lifetimes WHERE status='Not Install')        AS st_notinstall,      -- 기대 2
       (SELECT count(*) FROM lifetimes WHERE status='Scrap')              AS st_scrap;           -- 기대 1

-- (2) 뷰 정합
SELECT count(*) AS mismatch
  FROM v_current_tire t JOIN vehicle_positions vp ON vp.ch=t.ch AND vp.pos=t.pos
 WHERE t.serial IS DISTINCT FROM COALESCE(vp.serial2, vp.serial);        -- 기대 0

-- (3) 정합성 스냅샷
SELECT * FROM check_data_integrity();
```

**트리거 동작 테스트** — 반드시 트랜잭션 안에서 하고 **`ROLLBACK` 으로 되돌린다.**

```sql
BEGIN;
  -- 시나리오 A : 신규 시리얼 교체 → lifetimes 자동 생성 + serial2 동기화 + 구 타이어 Spare
  INSERT INTO replacements (ch,pos,date,new_serial)
  VALUES ('824','L1', DATE '2026-08-26', 'TESTSN000001D');

  SELECT * FROM lifetimes WHERE serial='TESTSN000001D';                   -- 1행, status Install, install 2026-08-26
  SELECT serial2 FROM vehicle_positions WHERE ch='824' AND pos='L1';      -- TESTSN000001D
  SELECT status FROM lifetimes WHERE serial='DA1BFBPH02436D';             -- Spare 로 전환
  SELECT serial, repl_count FROM v_current_tire WHERE ch='824' AND pos='L1';

  -- 시나리오 B : 3회차 교체도 이력이 남는지 (항목 2)
  INSERT INTO replacements (ch,pos,date,new_serial)
  VALUES ('835','L3 Out', DATE '2026-08-26', 'TESTSN000002D');
  SELECT * FROM v_position_history WHERE ch='835' AND pos='L3 Out' ORDER BY seq_no;
  -- 기대 : 최초 DA12511H02832D + 교체 3건(03159D, 05098D, TESTSN000002D) = 4행 전부 조회됨

  -- 시나리오 C : 로테이션 시 구 타이어를 Spare 로 내리지 않는지
  --   (다른 포지션에 장착된 시리얼을 새 교체로 투입하는 경우)
ROLLBACK;
```

> **게이트 1 통과 조건**: (1)의 7개 수치가 기대값과 전부 일치 · (2) mismatch = 0 · 시나리오 A·B 성공 · `ROLLBACK` 후 `lifetimes` 95행 복귀.

---

## Phase 2 · 프론트엔드

### 2-1. 조회 소스 전환 (항목 2)

Phase 0에서 찾은 참조 지점을 다음으로 교체한다.

| 기존 | 변경 후 |
|---|---|
| `vehicle_positions` 에서 `serial`, `serial2` 를 읽고 코드에서 `serial2 ?? serial` 분기 | `v_current_tire` 의 `serial` 을 그대로 사용 |
| 이전 시리얼 표시(`A → B`) 를 `serial`/`serial2` 로 구성 | `v_position_history` 를 `ch,pos` 로 조회해 **전체 체인** 표시 |
| 교체 여부 판정 | `v_current_tire.repl_count > 0` |

- 상세 카드의 `Serial DA1BFANH07686D → DA12511H03031D` 부분은 **2개 고정이 아니라 N개 체인**으로 렌더링한다. 3개 이상이면 `A → B → C` 로 이어 붙이고, 각 화살표 아래에 교체일을 작게 표기한다.
- `serial2` 를 직접 참조하는 코드는 **모두 제거**한다. 컬럼은 DB에 남지만 프론트는 쓰지 않는다.

### 2-2. 상세 조회 화면 (항목 5)

`Klik → lihat DB umur` 동작을 다음으로 바꾼다.

1. `v_tire_detail` 을 `serial` 로 단건 조회한다. **이 뷰는 `lifetimes` 에 없는 시리얼도 행을 반환하므로 "결과 없음" 분기가 사라진다.**
2. `is_registered = false` 인 경우
   - 상단에 경고 배지 표시 — 인도네시아어 **`Belum terdaftar di DB umur ban`**
   - `install_date`·`status`·`lifetime_days` 자리에는 `—` 를 표시하고, 대신 `first_inspection` ~ `last_inspection`, `inspection_count`, `last_tread`, `last_pressure` 를 채워 **빈 화면이 되지 않게 한다.**
   - 안내 문구 1줄: `Data diambil dari riwayat pemeriksaan. Mohon lengkapi data pemasangan awal.`
3. `is_registered = true` 인 경우 기존 표시를 유지하되, `current_ch`/`current_pos`/`current_mounted_at` 을 함께 보여 준다.
4. 기존 트레드·공기압 추이 차트는 그대로 `inspections` 를 쓴다. 변경하지 않는다.

**표기 규약**(사내 지침):
- 트레드 mm — 소수점 첫째 자리 (`11.2 mm`)
- 공기압 psi — 정수 (`117 psi`)
- 수량·일수 — 정수, 천 단위 콤마 (`1,250`)
- 퍼센트 — 소수점 첫째 자리 (`34.3%`)
- 소수점은 마침표, 천 단위는 콤마. **인도네시아식 `1.234,56` 은 쓰지 않는다.**

### 2-3. 정합성 배지 (항목 6)

- 대시보드(차량 레이아웃 화면 상단)에 정합성 배지를 추가한다. `supabase.rpc('check_data_integrity')` 를 호출한다.
- `severity='error'` 인 항목의 `cnt` 합이 0 이면 녹색 `Data konsisten`, 1 이상이면 주황 `N masalah data` 로 표시하고 클릭 시 `detail` 을 목록으로 펼친다.
- `severity='warning'`/`'info'` 는 펼친 목록에만 표시하고 배지 색에는 반영하지 않는다. (현재 `install_but_unmounted = 2` 는 Techking 회신 대기 중인 **정상 상태**이므로 이것 때문에 배지가 빨개지면 안 된다.)

### 2-4. 색상·타이포 (사내 디자인 지침)

기존 화면과 어긋나지 않게, 새로 추가하는 배지·안내 영역에만 적용한다.

| 용도 | Hex |
|---|---|
| 배경 (60%) | `#F0F0F0` |
| 주요 요소 (30%) | `#E3F2FD` / `#ECEFF1` |
| 강조·성공 (10%) | `#E8F5E9` |
| 텍스트·경계선 | `#546E7A` |

미등록 배지처럼 경고를 나타내는 색이 팔레트에 없으면 `#546E7A` 기반의 낮은 채도 주황을 쓰고, WCAG AA 명도 대비를 확인한다.

### 게이트 2

- [ ] `serial2` 전 코드 검색 결과 0건 (DB 컬럼 주석 제외)
- [ ] 미등록 시리얼로 상세 화면 진입 시 빈 화면이 나오지 않음 (테스트용 시리얼로 확인 후 롤백)
- [ ] `CH 835 L3 Out` 상세에서 시리얼 체인 4개가 모두 보임
- [ ] `CH 824`, `CH 847` 전 포지션 상세 조회 정상 (2026-08-26 복구분)
- [ ] 빌드·린트·타입체크 통과

---

## Phase 3 · 마무리

1. **회귀 확인** — 게이트 1의 검증 쿼리를 다시 돌려 수치가 그대로인지 본다.
2. **문서화** — 저장소에 `docs/data-model.md` 를 만들고 다음을 기록한다.
   - 5개 뷰의 목적과 사용처
   - 트리거 4종의 실행 순서와 이유 (`a_/b_/c_` 접두어 규약 포함)
   - `serial2` 가 deprecated 캐시 컬럼이라는 사실
   - `lifetimes.install` = **최초 투입일**이며 로테이션으로 갱신하지 않는다는 규칙
3. **월간 운영 절차 갱신** — 월간 점검 데이터 반영 스크립트에서 `[3-1] serial2 수동 UPDATE 블록`을 **삭제**한다. 트리거가 대신한다. (`samtan_update_20260705.sql` 참조)
4. **커밋** — 논리 단위로 나눈다. 예: `feat(db): lifetimes 무결성 및 감사 규약 추가` / `feat(db): 타이어 조회 뷰 5종` / `feat(db): 교체 동기화 트리거` / `refactor(web): v_current_tire 기반 조회 전환` / `feat(web): 미등록 타이어 대체 표시 및 정합성 배지`

---

## 4. 절대 하지 말 것

- ❌ `lifetimes` / `vehicle_positions` / `replacements` 의 **기존 행 값을 바꾸는 마이그레이션**. 데이터는 2026-08-26에 검증 완료됐다.
- ❌ `vehicle_positions.serial2` 컬럼 **DROP**
- ❌ `inspections` / `replacements` **하드 삭제**, 또는 `forbid_hard_delete` · `guard_soft_delete` 트리거 제거
- ❌ 기존 RLS 정책 변경, 뷰를 `security_invoker` 없이 생성
- ❌ 트리거 이름의 `a_/b_/c_` 접두어 변경
- ❌ `no.20 DA1BFANH05095D`, `no.72 DA1BFBPH02426D` 를 임의로 고치기 — **Techking 회신 대기 항목**이다
- ❌ 테스트 데이터를 `COMMIT` 하기

---

## 5. 참고 · 현재 알려진 예외

| 항목 | 값 | 성격 |
|---|---|---|
| `install_but_unmounted` | 2건 | 원장 오류. Techking 회신 대기 (`DA1BFANH05095D`, `DA1BFBPH02426D`) |
| `note` 가 채워진 `lifetimes` 행 15건 | `850 R2i`, `813 R2o (35 Silo)` 등 | **TMS 미등록 차량**(813·838·842·850·852·859) 장착분. 오류 아님. 정합성 체크에서 `note IS NOT NULL` 로 제외 중 |
| `position_over_2_serials` | 2건 | `CH 835 L3 Out`(3회), `CH 849 R2 In`(3회). 항목 2가 해결하는 대상 |
| `DA12511H03159D` | `vehicle_positions` 에서 밀려남 | 2칸 한도의 실증 사례. `v_position_history` 도입 후 조회 가능해져야 한다 — **게이트 2 검증 항목** |
