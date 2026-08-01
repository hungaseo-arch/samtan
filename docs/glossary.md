# 용어집 (Glossary)

UI 문구·문서·커밋 메시지에서 아래 대응을 따릅니다.
사용자 대면 문자열은 한국어(`ko`)·인도네시아어(`id`) 2개 로케일을 모두 작성하며,
현장 점검자 화면의 기본 로케일은 `id`입니다 (§3.2-6).

## 측정·점검

| 한국어 | English | Bahasa Indonesia | DB |
|---|---|---|---|
| 점검 | Inspection | Pemeriksaan / Monitoring | `inspections` |
| 차량 | Vehicle / Unit | Unit / Kendaraan | `vehicles.ch` |
| 포지션 | Position | Posisi | `pos` |
| 공기압 | Tire pressure | Tekanan angin | `pressure` |
| 트레드 잔량 | Tread depth | Kedalaman alur | `tread` |
| 가동시간 | Hour meter | Jam operasi | `hm` |
| 주행거리 | Odometer | Kilometer | `km` |
| 좌측 / 중앙 / 우측 | Left / Center / Right | Kiri / Tengah / Kanan | 트레드 측정 위치 |
| 운전자 | Driver | Pengemudi | `inspections.driver` |

## 타이어·정비

| 한국어 | English | Bahasa Indonesia | DB |
|---|---|---|---|
| 교체 | Replacement | Penggantian | `replacements` |
| 시리얼 번호 | Serial number | Nomor seri | `serial` |
| 마모 | Wear | Aus | `removal_reason='aus'` |
| 펑크 | Puncture | Bocor | `removal_reason='bocor'` |
| 파열 | Burst | Pecah | `removal_reason='pecah'` |
| 로테이션 | Rotation | Rotasi | `removal_reason='rotasi'` |
| 기타 | Other | Lain | `removal_reason='lain'` |
| 수명 | Lifetime | Masa pakai | `lifetimes` |
| 폐기 | Scrap | Buang / Afkir | `lifetimes.scrap` |
| 손상 코드 | Damage code | Kode kerusakan | `damage_codes` |

## 원가·분석

| 한국어 | English | Bahasa Indonesia | DB |
|---|---|---|---|
| 시간당 원가 | Cost per hour (CPH) | Biaya per jam | `finance.v_tire_cph` |
| 구매원가 | Purchase cost | Harga beli | `finance.tire_cost` |
| 마모율 | Wear rate | Laju keausan | `v_tread_wear_rate` |

## 상태 표시

트레드 임계치 (CLAUDE.md 기준):

| 한국어 | English | Bahasa Indonesia | 기준 |
|---|---|---|---|
| 위험 | Critical | Kritis / Bahaya | 트레드 3.0 mm 이하 |
| 주의 | Warning | Perhatian | 트레드 5.0 mm 이하 |
| 정상 | Normal | Normal | 트레드 5.0 mm 초과 |

## 역할

| 한국어 | English | Bahasa Indonesia | 코드 |
|---|---|---|---|
| 총괄 관리자 | Super admin | Administrator utama | `super_admin` |
| 운영 관리자 | Operations manager | Manajer operasi | `ops_manager` |
| 현장 점검자 | Inspector | Teknisi / Inspektur | `inspector` |
| 고객사 열람자 | Customer viewer | Pelihat pelanggan | `customer_viewer` |

> 현재 프로덕션은 3개 역할(`admin` / `inspector` / `viewer`)로 운영 중입니다.
> 위 4개 역할 체계로의 이관은 T-301에서 다룹니다. `docs/decisions.md` X-2 참조.

## 표기 주의

- 인도네시아어 화면에도 **영미식 숫자 표기**를 적용합니다. `1.234,56` 형식은 사용하지 않습니다 (§6.1).
- 차량번호는 화면에 `CH 824` 형태로 표시하되 DB에는 `824`로 저장되어 있습니다.
- 시리얼(`DA1BFANH07451D`)·타이어 규격(`26.5R25`)에는 천 단위 콤마를 넣지 않습니다 (§6.4).
