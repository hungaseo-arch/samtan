# 제안 — 현장 소견(TEMUAN) → `damage_codes` 매핑

작성 2026-08-27 · 근거 `samtan_tms_작업지시서_v3.md` §C-5
**상태: 설계만. 구현은 다음 회차 지시서로 넘긴다.**

## 1. 왜 필요한가

`inspections.remark` 는 자유 텍스트다. 현재 값은 아래 10종뿐이고 형식도 일정한데
(`TEMUAN: | <소견> | TINDAK LANJUT: | <조치>`), 문자열이라 집계가 되지 않는다.
"중앙부 마모가 몇 건인가" 를 묻는 순간 `LIKE '%TENGAH%'` 를 쓰게 되고,
그건 화면·뷰·보고서마다 제각각 다시 쓰인다.

DB 실측 분포 (548행 중 소견이 있는 65행):

| 소견 원문 | 건수 |
|---|---:|
| `TEMUAN: \| PADA TELAPAK BAGIAN TENGAH SUDAH GUNDUL \| TINDAK LANJUT: \| -` | 20 |
| `[DATA REVIEW REQUIRED]` (적재 시 부여한 플래그, 소견 아님) | 30 |
| `SCRAP` | 6 |
| `TEMUAN: \| GUNDUL \| TINDAK LANJUT: \| SCRAP` | 2 |
| `TEMUAN: \| PADA TELAPAK BAGIAN KIRI MULAI GUNDUL \| TINDAK LANJUT: \| -` | 2 |
| `… BAGIAN KANAN DAN TENGAH SUDAH GUNDUL …` | 1 |
| `… BAGIAN KIRI DAN TENGAH SUDAH GUNDUL …` | 1 |
| `… BAGIAN TENGAH MULAI GUNDUL …` | 1 |
| `… BAGIAN KIRI SUDAH GUNDUL …` | 1 |
| `… BAGIAN TENGAH DAN KANAN SUDAH GUNDUL …` | 1 |

## 2. 먼저 정리해야 할 것 — 지시서가 제안한 코드 3개가 DB에 없다

`damage_codes` 는 14종이고, 현재 내용은 다음과 같다.

`WO` Worn Out · `SC` Sidewall Cut · `BC` Bead Cut · `BB` Bead Bulge · `SHC` Shoulder Cut ·
`ILB` Inner Liner Bulge · `CD` Crown Damage · `SWB` Spot Wear Brake · `IW` Irregular Wear ·
`SCF` Sidewall Scuffing · `BO` Burn Out · `RF` Run Flat · `ORF` Over Run Flat · `OTH` Other

지시서 §C-5 가 제안한 `CW` / `SW` / `AL` 은 **이 14종에 없다**. `CD` 만 있다.
따라서 매핑은 둘 중 하나를 골라야 한다.

**(가) 기존 코드로 흡수** — 중앙 마모·숄더 마모를 모두 `IW`(Irregular Wear)로 보낸다.
스키마를 안 건드리는 대신, §0.3 에서 실증한 **중앙 마모 52.2% vs 숄더 마모 1.8%** 라는
구분이 코드 레벨에서 사라진다. Techking 클레임의 핵심 근거를 집계 불가로 만든다.

**(나) 코드 3종 추가 (권고)** — `CW` / `SW` / `AL` 을 `damage_codes` 에 넣는다.
`seq` 는 기존 값을 건드리지 않도록 14·15·16 을 쓴다.
`damage_codes` 는 참조 표이고 `INSERT … ON CONFLICT DO UPDATE` 로 멱등하게 추가된다.
기존 14종은 한 건도 바뀌지 않으므로 `lifetimes.damage` 의 기존 `CD` 1건도 영향 없다.

**권고는 (나)** 다. 다만 코드 신설은 거래처와 공유하는 손상코드 체계를 건드리는 일이므로
**사용자 승인 후** 마이그레이션을 작성한다.

## 3. 매핑 제안

전제: `TEMUAN:` 과 `TINDAK LANJUT:` 사이의 소견부만 본다. 대문자로 정규화한 뒤 판정한다.
**한 소견이 여러 코드에 걸릴 수 있다** (`KIRI DAN TENGAH` = 숄더 + 중앙). 그래서
`inspections.damage_code` 단일 컬럼이 아니라 **`inspection_findings` 다대일 표**를 권고한다.

| 소견 패턴 (정규화 후) | 코드 | 의미 | 현재 건수 |
|---|---|---|---:|
| `TENGAH` + (`SUDAH GUNDUL` \| `MULAI GUNDUL`) | `CW` | 중앙부 마모 | 24 |
| (`KIRI` \| `KANAN`) + (`SUDAH GUNDUL` \| `MULAI GUNDUL`) | `SW` | 숄더 마모 | 6 |
| `TOE IN` | `AL` | 얼라인먼트 | 0 |
| `TEMBUS SAMPAI INNERLINER` | `CD` | Crown Damage (기존) | 0 |
| `GUNDUL` 단독 (부위 없음) + `TINDAK LANJUT: SCRAP` | `WO` | Worn Out (기존) | 2 |

`SUDAH`(이미) 와 `MULAI`(시작) 는 **코드를 나누지 않고 심각도로 분리**한다.
같은 부위의 같은 현상이고, 코드를 넷으로 쪼개면 집계할 때 다시 합쳐야 한다.

| 부사 | `severity` |
|---|---|
| `MULAI` (시작) | `warning` |
| `SUDAH` (이미) | `critical` |

`TOE IN` 과 `TEMBUS SAMPAI INNERLINER` 는 **현재 원장에 한 건도 없다**.
지시서 §C-5 표에 있어 매핑에 포함했지만, 실데이터 검증은 해당 소견이
들어오는 회차에 가서야 가능하다. 규칙만 두고 건수 0 으로 출발한다.

`[DATA REVIEW REQUIRED]` 30건은 소견이 아니라 적재 시 우리가 붙인 플래그다.
매핑 대상에서 제외하고, 별도로 `v_data_quality` 가 이미 잡고 있다.

## 4. 구현 시 형태 (다음 회차용 초안)

```sql
-- 1) 코드 3종 추가 — 기존 14종은 건드리지 않는다
insert into public.damage_codes (code, description, seq) values
  ('CW', 'Center Wear',    14),
  ('SW', 'Shoulder Wear',  15),
  ('AL', 'Alignment',      16)
on conflict (code) do update set description = excluded.description;

-- 2) 소견 표 — 한 점검행이 코드를 여러 개 가질 수 있다
create table if not exists public.inspection_findings (
  id            uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections(id),
  code          text not null references public.damage_codes(code),
  severity      text not null default 'warning'
                check (severity in ('warning','critical')),
  source        text not null default 'auto'
                check (source in ('auto','manual')),   -- auto = remark 파싱분
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  unique (inspection_id, code)
);
```

`source` 를 두는 이유: 자동 파싱분과 점검자가 손으로 고른 코드를 구분해야
파서를 고쳤을 때 **자동분만 다시 만들 수 있다**. 손으로 넣은 값은 보존된다.

`remark` 원문은 **지우지 않는다**. 파싱은 원문 위에 얹는 색인이지 대체물이 아니다.

## 5. 미결

1. **코드 3종 신설 승인** — 거래처 공유 코드 체계 변경이라 사용자 결정이 필요하다.
   승인 전에는 마이그레이션을 쓰지 않는다.
2. **`KIRI`/`KANAN` 방향** — `SW` 는 좌우를 구분하지 않으므로 v3 §Q1(방향 규약 보류)의
   영향을 받지 않는다. 좌우를 나눈 코드(`SW-L`/`SW-R`)를 원한다면 Q1 확정이 선행되어야 한다.
3. **소급 적용 범위** — 기존 65행 remark 를 소급 파싱할지, 다음 회차부터 적용할지.
   소급이면 `source='auto'` 로 일괄 생성 후 검토하는 편이 안전하다.
