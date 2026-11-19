// @section: life-tab
import { Fragment, useState, useEffect, useRef } from "react";
import { TMS_DATA, treadLevel, treadThresholds, targetLifeKm, meterUnresolved, lifeEndBasis } from "@/data/tmsData";
import type { TreadLevel } from "@/data/tmsData";
import {
  codeName, fmtD, lifeCalc, findUnitBySerial, latestTreadOf, latestTreadAvgOf, tireHistory, tireMovements,
  prepDaysLeft, PREP_WINDOW_DAYS, PREP_URGENT_DAYS, tireCostOf, ledgerOf, type LifeCalc,
} from "@/data/tmsUtils";
import { EMPTY, fmtCpk, fmtInt, fmtTread, kmPerMmOf, todayInField } from "@/lib/format";
import type { LifeRecord } from "@/data/tmsData";
import { X, Download, ArrowUp, ArrowDown, ArrowUpDown, AlertTriangle, AlertCircle } from "lucide-react";
import { DICT, useLang } from "@/i18n";
import { useDialog } from "@/lib/useDialog";
import { useAuth } from "@/auth/AuthProvider";
import TireDetailCard from "./TireDetailCard";
import IrregularWearBadge from "./IrregularWearBadge";
import TireCostSection from "./TireCostSection";

// 4단계 신호등 — 녹색 ≥10mm / 황색 5~10mm / 주황 3~5mm(발주) / 적색 <3mm
const TREAD_CLS: Record<TreadLevel, string> = {
  ok: "text-level-ok",
  warn: "text-level-warn font-bold",
  order: "text-level-order font-bold",
  danger: "text-level-danger font-bold",
};

const buildTX = () => ({
  ko: {
    dbTitle: "타이어 수명 DB",
    status: "상태",
    all: "상태 전체",
    viewGroup: "보기",
    pcs: "본",
    colNo: "No",
    colSerial: "시리얼",
    colInstall: "최초 장착일",
    colTread: "최근 트레드",
    avgPrefix: "평균 ",
    colTreadAvg: "최근 트레드(4점평균)",
    colKm: "주행 KM",
    colHr: "주행 HR",
    colExpKm: "예상 KM (0mm)",
    colExpHm: "예상 HM (0mm)",
    // 수명 종료 기준별 열 머리 (T-3) — tire_config.life_end_basis
    expKmBasis: { min: "예상 KM (최소 0mm)", three_zero: "예상 KM (3점 0mm)", four_zero: "예상 KM (4점 0mm)" },
    expHmBasis: { min: "예상 HM (최소 0mm)", three_zero: "예상 HM (3점 0mm)", four_zero: "예상 HM (4점 0mm)" },
    fourPointShort: "4점 측정 부족",
    cmpPrefix: "[비교] ",
    fourPointShortTip: "4점(좌·중1·중2·우) 측정 회차가 2개 미만이라 이 기준으로 외삽 불가",
    colCpk: "CPK",
    colExpCpk: "예상 CPK",
    colTotalCost: "총비용",
    cpkExpPrefix: "예상 ",
    colCurrency: "통화",
    colRemKm: "잔여 KM (발주)",
    colProjDate: "예상 교체일",
    colLastMeas: "마지막 측정",
    agoDays: "{n}일 전",
    detailHint: "HR·예상 HM·CPK·상태 : 행 클릭 시 확인",
    tipEkm: "예상 KM : 신품 22 mm부터 측정된 타이어의 수명 종료 기준 도달 시점 추정 KM",
    tipRem: "잔여 KM : 최근 트레드에서 발주 기준까지 남은 주행거리",
    hCpk: "CPK",
    tableLabel: "타이어 수명 목록",
    belowNote: "발주 기준 {mm} mm 미만 · 폐기 아님",
    lastMeasAll: "전 차량 마지막 측정 {d} · {n}일 전",
    minLabel: "최저",
    colsHidden: "HR·CPK 열 : 1000px 이상 화면에서 표시 · 장착 외 상태 : 시리얼 아래 표기",
    activeFilters: "적용 중 : {f}",
    colWearRate: "마모율 (mm/1,000km)",
    colKmPerMm: "km/mm",
    due30: "30일 이내·경과",
    viewAll: "전체 타이어",
    sortReset: "정렬 해제",
    projExcluded: "측정 오래됨·미감시 — 준비 목록 제외",
    searchPh: "시리얼·차량 검색",
    projDays: "{n}일",
    projOver: "{n}일 경과",
    projBelow: "기준 이하",
    projNow: "즉시",
    noMatch: "일치 없음",
    clearAll: "검색·필터 해제",
    rowOpen: "이력 열기",
    projLast: "마지막 측정 {d}",
    projLastAge: "측정 {n}일 전",
    chipChAll: "차량 전체",
    projBelowTitle: "발주 기준 이하 — 예상일은 마지막 측정일",
    remAsOf: "마지막 측정 시점 기준 잔여",
    projOverTitle: "측정 후 주행으로 이미 도달 예상 · 재측정 필요",
    projWhy: { few_rounds: "회차 3개 미만 — 예측 불가", no_trend: "마모 추세 없음 — 예측 불가", hm_reset: "HM Reset 차량 — 계기 보정 전 예측 불가", no_data: "측정 데이터 부족", none: "예상 KM 산출 불가 — 신품 기준 회차 등 조건 미충족" },
    projWhyShort: { few_rounds: "회차 부족", no_trend: "추세 없음", hm_reset: "HM Reset", no_data: "데이터 부족", none: "산출 불가" },
    estReached: "도달",
    estReachedTip: "누적 KM 이 0 mm 예상치 이상",
    statusName: { Install: "장착", Scrap: "폐기", Spare: "예비", "Not Install": "미장착" },
    footMore: "기준 전체 보기",
    foot8a: "잔여 KM · 예상 교체일",
    foot8b: ` = 최근 트레드에서 발주 기준 ${treadThresholds().order}mm 까지 남은 주행거리와 그 도달일. 마모율은 트레드 vs 누적 KM 회귀, 날짜 환산은 그 차량의 최근 30일 평균 일일 주행 KM(없으면 일 마모율). 30일 이내는 노랑, 14일 이내는 빨강. 예상 KM·HM (0mm) 은 0mm 도달 기준으로 별개`,
    colStatus: "상태",
    colNote: "비고",
    avg: "평균",
    nonMeasured: "측정 외",
    hmReset: "HM Reset",
    hmResetFixed: "HM Reset ✓",
    hmResetFixedTitle: "계기 리셋 보정값 적용 — HM·KM 을 리셋 전 누적값에 이어 계산",
    foot1a: "행 클릭",
    foot1b: " 시 해당 타이어의 전체 히스토리(장착·탈착·폐기·HM Reset·측정 회차)를 모달로 확인 가능",
    foot2a: "목표 수명 {km} km",
    foot2b: " — 예상수명이 목표 이상이면 초록색 표시",
    foot3a: "최근 수명(km·hr)",
    foot3b: " = 측정 시작(신품)부터 최신 회차까지 누적 주행거리·가동시간. ",
    foot3c: "최근 트레드",
    foot3d: " = 가장 최근 회차의 폭 4점 중 ",
    foot3dMin: "최소값",
    foot3d2: `(<${treadThresholds().caution}mm 주의, <${treadThresholds().order}mm 발주, <${treadThresholds().critical}mm 권장 교체). 교체 판정은 가장 얇은 지점 기준. 그 아래 회색 숫자는 같은 회차의 `,
    foot3dAvg: "4점 평균",
    foot3d3: ". 중앙 그루브가 먼저 닳는 타이어는 최소값이 0.0mm 여도 숄더가 남아 주행 중일 수 있으며, 두 값의 차이로 그 상태 확인. 4점 측정 이전 회차는 평균 미표시",
    foot4a: "HM Reset",
    foot4b: " = 운용 중 차량의 가동시간계(Hour Meter)·주행거리가 0으로 초기화된 차량(CH 832·835). 리셋 이전 누적 이력이 끊겨 수명·예상수명이 ",
    foot4c: "로 표시될 수 있음",
    foot5: "예상 KM은 트레드가 신품 22mm부터 측정된 타이어에 한해 0mm 도달 시점을 추정. 교체·폐기(Scrap)·미장착(Not Install) 타이어는 미표시.",
    foot5Basis: {
      min: " 현재 수명 종료 기준은 «최소 0mm» — 회차별 4점 중 최소값이 0mm 에 닿는 시점. 센터 홈만 0mm 인 타이어는 숄더가 남아 실제로는 더 주행",
      three_zero: " 현재 수명 종료 기준은 «3점 0mm» — 회차별 4점 중 두 번째로 큰 값이 0mm 에 닿는 시점(4점 중 3점이 0mm). 4점 측정 회차만 사용하며, 2회차 미만이면 «4점 측정 부족»",
      four_zero: " 현재 수명 종료 기준은 «4점 0mm» — 회차별 4점 중 최대값이 0mm 에 닿는 시점(4점 모두 0mm). 4점 측정 회차만 사용하며, 2회차 미만이면 «4점 측정 부족»",
    },
    foot6a: "측정 외",
    foot6b: " = 모니터링 5대(834·839·832·835·849) 외 차량 장착 또는 예비 타이어 — 점검 데이터가 없어 트레드·주행·예상이 ",
    foot6c: "로 표시",
    foot7a: "비고의 ",
    foot7b: "손상 코드",
    foot7c: "를 클릭하면 설명 모달 표시. ",
    foot7d: "손상 코드 전체 보기",
    codesTitle: "손상 코드",
    histNotInstall: "미장착",
    histTireHistory: "타이어 히스토리",
    hInstall: "최초 장착일",
    hMount: "재장착일",
    hMountSub: "교체 장착",
    hRemove: "탈착일",
    hScrap: "폐기일",
    hDamage: "손상 코드",
    hHmReset: "HM Reset",
    hHmResetYes: "해당 (계기 초기화 차량)",
    hHmResetNo: "없음",
    hKmHr: "주행 KM / HR",
    hExpKmHm: "예상 KM / HM",
    hTread: "최근 트레드",
    wL: "좌", wC1: "중1", wC2: "중2", wR: "우",
    hTreadMin: "최소",
    hTreadAvg: "평균",
    colIrregular: "편마모",
    hWidths: "폭 4점",
    hNoWidths: "4점 측정 이전 회차",
    modalFoot: "굵은 숫자는 그 회차의 최소값이며 교체 판정과 색상은 최소값 기준. 평균은 참고용. 중앙이 먼저 닳는 타이어는 최소값이 0.0mm 여도 숄더 잔존",
    colDepth: "트레드(mm)",
    measHist: "측정 이력",
    sessions: "회차",
    noMeasData: "측정 데이터 없음",
    colInspect: "점검일",
    moveHist: "장착 이력 (위치·차량 변경)",
    moveNone: "장착 이력 1건 (변경 없음)",
    mDate: "장착일",
    mVehicle: "차량",
    mPos: "포지션",
    mKind: "구분",
    mInstall: "최초 장착",
    mMount: "교체 장착",
    mCurrent: "현재",
    excelDownload: "엑셀 다운로드",
    kmLower: "하한값",
    kmLowerTip: "장착 전 주행 미상 — 장착일이 없고 첫 측정이 신품이 아니어서(또는 km 기록 없음) 첫 점검 이전 주행이 빠져 실제보다 작음",
    avgExclLower: "하한값 제외 {n}본 평균",
    colKmFlag: "km_flag",
    colKmMethod: "km_method",
    foot9a: "주행 KM (하한값)",
    foot9b: " = 원장 구간 경계 km 는 교체 시 입력 KM → 같은 날 점검 회차 → 앞뒤 회차 날짜 비례 보간 순으로 산출. 장착일이 없는 최초 장착분은 첫 측정이 신품(4점 평균 22mm)이면 그 회차를 장착 시점으로 보고 탈착까지 전 구간을 반영(FIRST_NEW_INSPECTION, 하한값 아님). 첫 측정이 신품이 아니거나 km 기록이 없는 경우만 하한값. 평균행의 주행 KM 은 하한값을 뺀 평균. 거리는 트레드와 무관하게 측정하며, 센터 홈 0mm 회차도 주행 중으로 집계",
  },
  id: {
    dbTitle: "DB Umur Ban",
    status: "Status",
    all: "Semua status",
    viewGroup: "Tampilan",
    pcs: "pcs",
    colNo: "No",
    colSerial: "Serial",
    colInstall: "Tgl pasang awal",
    colTread: "Tapak terkini",
    avgPrefix: "rerata ",
    colTreadAvg: "Tapak terkini (rata-rata 4 titik)",
    colKm: "KM tempuh",
    colHr: "Jam (HR)",
    colExpKm: "Prediksi KM (0mm)",
    colExpHm: "Prediksi HM (0mm)",
    expKmBasis: { min: "Prediksi KM (min 0mm)", three_zero: "Prediksi KM (3 titik 0mm)", four_zero: "Prediksi KM (4 titik 0mm)" },
    expHmBasis: { min: "Prediksi HM (min 0mm)", three_zero: "Prediksi HM (3 titik 0mm)", four_zero: "Prediksi HM (4 titik 0mm)" },
    fourPointShort: "Ukur 4 titik kurang",
    cmpPrefix: "[Banding] ",
    fourPointShortTip: "Sesi ukur 4 titik (Kiri·Tgh 1·Tgh 2·Kanan) kurang dari 2 sehingga tidak dapat diekstrapolasi dengan kriteria ini",
    colCpk: "CPK",
    colExpCpk: "CPK prediksi",
    colTotalCost: "Total biaya",
    cpkExpPrefix: "pred. ",
    colCurrency: "Mata uang",
    colRemKm: "Sisa KM (pesan)",
    colProjDate: "Prakiraan tgl ganti",
    colLastMeas: "Ukur terakhir",
    agoDays: "{n} hr lalu",
    detailHint: "HR·Prediksi HM·CPK·Status : klik baris",
    tipEkm: "Prediksi KM : estimasi KM saat batas akhir umur tercapai, untuk ban terukur sejak baru 22 mm",
    tipRem: "Sisa KM : jarak tempuh dari Kedalaman alur terakhir sampai batas pesan",
    hCpk: "CPK",
    tableLabel: "Daftar umur ban",
    belowNote: "Batas pesan < {mm} mm · bukan scrap",
    lastMeasAll: "Ukur terakhir semua unit {d} · {n} hr lalu",
    minLabel: "Terendah",
    colsHidden: "Kolom HR·CPK : tampil di layar ≥ 1000px · Status selain terpasang : di bawah serial",
    activeFilters: "Aktif : {f}",
    colWearRate: "Laju aus (mm/1,000km)",
    colKmPerMm: "km/mm",
    due30: "≤ 30 hari·lewat",
    viewAll: "Semua ban",
    sortReset: "Reset urutan",
    projExcluded: "Pengukuran lama·tidak dipantau — di luar daftar",
    searchPh: "Cari serial/unit",
    projDays: "{n} hari",
    projOver: "lewat {n} hari",
    projBelow: "Di bawah batas",
    projNow: "Segera",
    noMatch: "Tidak ada yang cocok",
    clearAll: "Hapus pencarian·filter",
    rowOpen: "Buka riwayat",
    projLast: "Ukur {d}",
    projLastAge: "Ukur {n} hr lalu",
    chipChAll: "Semua unit",
    projBelowTitle: "Di bawah batas pesan — tanggal = tgl ukur terakhir",
    remAsOf: "Sisa per ukur terakhir",
    projOverTitle: "Diperkirakan sudah tercapai sejak ukur terakhir · ukur ulang",
    projWhy: { few_rounds: "Kurang dari 3 Pemeriksaan — tidak dapat diprediksi", no_trend: "Tidak ada tren Aus — tidak dapat diprediksi", hm_reset: "Unit HM Reset — tidak dapat diprediksi sebelum koreksi meter", no_data: "Data pengukuran kurang", none: "KM prediksi tidak dapat dihitung — syarat seperti sesi baru belum terpenuhi" },
    projWhyShort: { few_rounds: "Sesi kurang", no_trend: "Tanpa tren", hm_reset: "HM Reset", no_data: "Data kurang", none: "Tak terhitung" },
    estReached: "Tercapai",
    estReachedTip: "KM kumulatif sudah mencapai perkiraan 0 mm",
    statusName: { Install: "Terpasang", Scrap: "Afkir", Spare: "Cadangan", "Not Install": "Belum pasang" },
    footMore: "Semua keterangan",
    foot8a: "Sisa KM · Prakiraan tgl ganti",
    foot8b: ` = sisa jarak dari Kedalaman alur terakhir sampai batas pesan ${treadThresholds().order}mm dan tanggal tercapainya. Laju Aus dari regresi Kedalaman alur vs KM kumulatif; konversi ke tanggal memakai rata-rata KM harian 30 hari terakhir Unit tersebut (jika tidak ada, laju Aus harian). ≤ 30 hari kuning, ≤ 14 hari merah. Prediksi KM·HM (0mm) adalah perkiraan terpisah sampai 0mm`,
    colStatus: "Status",
    colNote: "Catatan",
    avg: "Rata-rata",
    nonMeasured: "Non-ukur",
    hmReset: "HM Reset",
    hmResetFixed: "HM Reset ✓",
    hmResetFixedTitle: "Koreksi reset meter diterapkan — HM·KM dilanjutkan dari akumulasi sebelum reset",
    foot1a: "Klik baris",
    foot1b: " untuk melihat riwayat lengkap ban (pasang·lepas·afkir·HM Reset·sesi ukur) dalam modal",
    foot2a: "Target umur {km} km",
    foot2b: " — jika prediksi umur mencapai target atau lebih, ditampilkan hijau",
    foot3a: "Umur terkini (km·hr)",
    foot3b: " = akumulasi jarak·jam dari awal ukur (baru) hingga sesi terbaru. ",
    foot3c: "Tapak terkini",
    foot3d: " = ",
    foot3dMin: "nilai terkecil dari 4 titik lebar",
    foot3d2: ` pada sesi ukur terbaru (<${treadThresholds().caution}mm perhatian, <${treadThresholds().order}mm pesan ban, <${treadThresholds().critical}mm disarankan ganti). Penilaian ganti selalu memakai titik paling tipis. Angka abu-abu di bawahnya adalah `,
    foot3dAvg: "rata-rata 4 titik",
    foot3d3: " pada sesi yang sama. Pada ban yang alur tengahnya habis lebih dulu, nilai terkecil bisa 0.0mm padahal bahunya masih tersisa dan ban masih jalan — selisih kedua angka menunjukkan kondisi itu. Sesi sebelum pengukuran 4 titik tidak menampilkan rata-rata",
    foot4a: "HM Reset",
    foot4b: " = unit yang Hour Meter·jarak tempuhnya di-reset ke 0 saat operasi (CH 832·835). Riwayat akumulasi sebelum reset terputus sehingga umur·prediksi dapat ditampilkan ",
    foot4c: "",
    foot5: "Prediksi KM hanya untuk ban yang diukur dari kondisi baru 22mm, mengestimasi waktu mencapai 0mm, dan tidak ditampilkan untuk ban ganti·afkir (Scrap)·tidak terpasang (Not Install).",
    foot5Basis: {
      min: " Kriteria akhir umur saat ini «min 0mm» — saat nilai terkecil dari 4 titik mencapai 0mm. Ban yang hanya alur tengahnya 0mm masih punya bahu dan sebenarnya masih bisa jalan lebih jauh",
      three_zero: " Kriteria akhir umur saat ini «3 titik 0mm» — saat nilai terbesar kedua dari 4 titik mencapai 0mm (3 dari 4 titik 0mm). Hanya sesi ukur 4 titik; jika kurang dari 2 sesi, ditampilkan «Ukur 4 titik kurang»",
      four_zero: " Kriteria akhir umur saat ini «4 titik 0mm» — saat nilai terbesar dari 4 titik mencapai 0mm (keempat titik 0mm). Hanya sesi ukur 4 titik; jika kurang dari 2 sesi, ditampilkan «Ukur 4 titik kurang»",
    },
    foot6a: "Non-ukur",
    foot6b: " = terpasang di unit selain 5 unit pantau (834·839·832·835·849) atau ban cadangan — tanpa data inspeksi sehingga tapak·tempuh·prediksi ditampilkan ",
    foot6c: "",
    foot7a: "Pada Catatan, ",
    foot7b: "kode kerusakan",
    foot7c: " yang diklik akan membuka modal penjelasan. ",
    foot7d: "Lihat semua kode",
    codesTitle: "Kode Kerusakan",
    histNotInstall: "Tidak terpasang",
    histTireHistory: "Riwayat ban",
    hInstall: "Tgl pasang awal",
    hMount: "Tgl pasang ulang",
    hMountSub: "Pasang ganti",
    hRemove: "Tgl lepas",
    hScrap: "Tgl afkir",
    hDamage: "Kode Kerusakan",
    hHmReset: "HM Reset",
    hHmResetYes: "Ya (unit reset meter)",
    hHmResetNo: "Tidak",
    hKmHr: "KM tempuh / HR",
    hExpKmHm: "Prediksi KM / HM",
    hTread: "Tapak terkini",
    wL: "Kiri", wC1: "Tgh 1", wC2: "Tgh 2", wR: "Kanan",
    hTreadMin: "min",
    hTreadAvg: "rerata",
    colIrregular: "Aus tdk rata",
    hWidths: "4 titik lebar",
    hNoWidths: "Sesi sebelum pengukuran 4 titik",
    modalFoot: "Angka tebal adalah nilai minimum sesi tersebut; penilaian penggantian dan warna memakai nilai minimum. Rata-rata hanya acuan — pada ban yang aus di tengah, bahu masih tersisa meski minimum 0.0 mm",
    colDepth: "Tapak (mm)",
    measHist: "Riwayat ukur",
    sessions: "sesi",
    noMeasData: "Tidak ada data ukur",
    colInspect: "Tgl inspeksi",
    moveHist: "Riwayat pemasangan (posisi·unit)",
    moveNone: "Hanya 1 riwayat pemasangan (tidak berubah)",
    mDate: "Tgl pasang",
    mVehicle: "Unit",
    mPos: "Posisi",
    mKind: "Jenis",
    mInstall: "Pasang awal",
    mMount: "Pasang ganti",
    mCurrent: "Saat ini",
    excelDownload: "Unduh Excel",
    kmLower: "batas bawah",
    kmLowerTip: "Jarak sebelum pasang tidak diketahui — tanpa tanggal pasang dan Pemeriksaan pertama bukan ban baru (atau tanpa KM), jadi jarak sebelum Pemeriksaan pertama tidak terhitung",
    avgExclLower: "rata-rata {n} ban tanpa batas bawah",
    colKmFlag: "km_flag",
    colKmMethod: "km_method",
    foot9a: "KM tempuh (batas bawah)",
    foot9b: " = KM batas segmen dihitung berurutan dari KM saat penggantian → Pemeriksaan di hari yang sama → interpolasi proporsional tanggal antara dua Pemeriksaan. Ban pemasangan awal tanpa tanggal pasang : jika Pemeriksaan pertama menunjukkan ban baru (rata-rata 4 titik 22mm), sesi itu dianggap saat pasang dan seluruh jarak sampai dilepas dihitung (FIRST_NEW_INSPECTION, bukan batas bawah). Hanya jika Pemeriksaan pertama bukan ban baru atau tanpa KM, nilainya batas bawah; KM tempuh di baris rata-rata adalah rata-rata tanpa batas bawah. Jarak dihitung tanpa melihat Kedalaman alur — sesi dengan alur tengah 0mm tetap dihitung sebagai jalan",
  },
  en: {
    dbTitle: "Tire Lifetime DB",
    status: "Status",
    all: "All statuses",
    viewGroup: "View",
    pcs: "pcs",
    colNo: "No",
    colSerial: "Serial",
    colInstall: "First install date",
    colTread: "Latest tread",
    avgPrefix: "avg ",
    colTreadAvg: "Latest tread (4-point avg)",
    colKm: "Distance KM",
    colHr: "Operating HR",
    colExpKm: "Est. KM (0mm)",
    colExpHm: "Est. HM (0mm)",
    expKmBasis: { min: "Est. KM (min 0mm)", three_zero: "Est. KM (3-point 0mm)", four_zero: "Est. KM (4-point 0mm)" },
    expHmBasis: { min: "Est. HM (min 0mm)", three_zero: "Est. HM (3-point 0mm)", four_zero: "Est. HM (4-point 0mm)" },
    fourPointShort: "Too few 4-point rounds",
    cmpPrefix: "[Compare] ",
    fourPointShortTip: "Fewer than 2 rounds with all 4 points (L·C1·C2·R), so this basis cannot be extrapolated",
    colCpk: "CPK",
    colExpCpk: "Est. CPK",
    colTotalCost: "Total cost",
    cpkExpPrefix: "est. ",
    colCurrency: "Currency",
    colRemKm: "Remaining KM (order)",
    colProjDate: "Projected repl. date",
    colLastMeas: "Last measured",
    agoDays: "{n} d ago",
    detailHint: "HR·Est. HM·CPK·Status : click row",
    tipEkm: "Est. KM : projected KM at end-of-life basis, for tires measured from new 22 mm",
    tipRem: "Remaining KM : distance from latest tread to the order limit",
    hCpk: "CPK",
    tableLabel: "Tire lifetime list",
    belowNote: "Order limit < {mm} mm · not scrap",
    lastMeasAll: "All units last measured {d} · {n} d ago",
    minLabel: "Lowest",
    colsHidden: "HR·CPK columns : shown at ≥ 1000px · Non-mounted status : under serial",
    activeFilters: "Active : {f}",
    colWearRate: "Wear rate (mm/1,000km)",
    colKmPerMm: "km/mm",
    due30: "≤ 30 days·overdue",
    viewAll: "All tires",
    sortReset: "Clear sort",
    projExcluded: "Stale or unmonitored — not in prep list",
    searchPh: "Search serial/unit",
    projDays: "{n} d",
    projOver: "{n} d overdue",
    projBelow: "Below limit",
    projNow: "Now",
    noMatch: "No matches",
    clearAll: "Clear search·filters",
    rowOpen: "Open history",
    projLast: "Meas. {d}",
    projLastAge: "Meas. {n} d ago",
    chipChAll: "All units",
    projBelowTitle: "Below order threshold — date = last measurement",
    remAsOf: "Remaining as of last measurement",
    projOverTitle: "Likely reached since last measurement · re-measure",
    projWhy: { few_rounds: "Fewer than 3 inspections — cannot project", no_trend: "No wear trend — cannot project", hm_reset: "HM Reset vehicle — cannot project before meter correction", no_data: "Not enough measurement data", none: "Est. KM unavailable — conditions such as new-tire baseline not met" },
    projWhyShort: { few_rounds: "Few rounds", no_trend: "No trend", hm_reset: "HM Reset", no_data: "Low data", none: "N/A" },
    estReached: "Reached",
    estReachedTip: "Cumulative KM already at the 0 mm projection",
    statusName: { Install: "Mounted", Scrap: "Scrapped", Spare: "Spare", "Not Install": "Not mounted" },
    footMore: "All notes",
    foot8a: "Remaining KM · Projected date",
    foot8b: ` = distance left from the latest tread to the ${treadThresholds().order}mm order threshold, and the date it is reached. Wear rate is the regression of tread vs cumulative KM; dates use the average daily KM of that vehicle over the last 30 days (or the daily wear rate if KM is missing). Within 30 days yellow, within 14 days red. Est. KM·HM (0mm) is a separate projection to 0mm`,
    colStatus: "Status",
    colNote: "Note",
    avg: "Average",
    nonMeasured: "Not measured",
    hmReset: "HM Reset",
    hmResetFixed: "HM Reset ✓",
    hmResetFixedTitle: "Meter reset offset applied — HM·KM continue from the pre-reset total",
    foot1a: "Click a row",
    foot1b: " to open a modal with that tire's full history (install · removal · scrap · HM Reset · measurement rounds)",
    foot2a: "Target lifetime {km} km",
    foot2b: " — estimated lifetime at or above the target is shown in green",
    foot3a: "Latest lifetime (km·hr)",
    foot3b: " = cumulative distance and operating hours from the first measurement (new tire) to the latest round. ",
    foot3c: "Latest tread",
    foot3d: " = the ",
    foot3dMin: "minimum of the 4 width points",
    foot3d2: ` in the latest round (<${treadThresholds().caution}mm caution, <${treadThresholds().order}mm order, <${treadThresholds().critical}mm recommended replace). Replacement is judged on the thinnest point. The grey figure below it is the `,
    foot3dAvg: "4-point average",
    foot3d3: " for the same round. On tires whose centre grooves wear first, the minimum can read 0.0mm while the shoulders still have rubber and the tire is still running — the gap between the two shows that. Rounds measured before 4-point recording show no average",
    foot4a: "HM Reset",
    foot4b: " = vehicles whose Hour Meter and distance were reset to 0 during operation (CH 832·835). Cumulative history before the reset is broken, so lifetime and estimated lifetime may be shown as ",
    foot4c: "",
    foot5: "Estimated KM applies only to tires measured from a new 22mm tread and estimates when 0mm will be reached; it is not shown for replaced, scrapped (Scrap) or not-installed (Not Install) tires.",
    foot5Basis: {
      min: " The current end-of-life basis is «min 0mm» — when the smallest of the 4 points reaches 0mm. A tyre with only the centre grooves at 0mm still has shoulder rubber and actually runs further",
      three_zero: " The current end-of-life basis is «3-point 0mm» — when the second-largest of the 4 points reaches 0mm (3 of 4 points at 0mm). Only rounds with all 4 points are used; with fewer than 2 such rounds it shows «Too few 4-point rounds»",
      four_zero: " The current end-of-life basis is «4-point 0mm» — when the largest of the 4 points reaches 0mm (all 4 points at 0mm). Only rounds with all 4 points are used; with fewer than 2 such rounds it shows «Too few 4-point rounds»",
    },
    foot6a: "Not measured",
    foot6b: " = fitted to a vehicle outside the 5 monitored units (834·839·832·835·849) or held as a spare — with no inspection data, tread·distance·estimates are shown as ",
    foot6c: "",
    foot7a: "In the Note column, ",
    foot7b: "damage codes",
    foot7c: " open an explanation modal when clicked. ",
    foot7d: "View all damage codes",
    codesTitle: "Damage Codes",
    histNotInstall: "Not installed",
    histTireHistory: "Tire history",
    hInstall: "First install date",
    hMount: "Reinstall date",
    hMountSub: "Replacement install",
    hRemove: "Removal date",
    hScrap: "Scrap date",
    hDamage: "Damage Code",
    hHmReset: "HM Reset",
    hHmResetYes: "Yes (meter-reset vehicle)",
    hHmResetNo: "None",
    hKmHr: "Distance KM / HR",
    hExpKmHm: "Estimated KM / HM",
    hTread: "Latest tread",
    wL: "L", wC1: "C1", wC2: "C2", wR: "R",
    hTreadMin: "min",
    hTreadAvg: "avg",
    colIrregular: "Irregular",
    hWidths: "4 width points",
    hNoWidths: "Round measured before 4-point recording",
    modalFoot: "Bold figures are that round\u2019s minimum; replacement judgement and colour follow the minimum. The average is reference only — a centre-worn tyre can read 0.0 mm at the minimum while the shoulders still carry rubber",
    colDepth: "Tread (mm)",
    measHist: "Measurement history",
    sessions: "rounds",
    noMeasData: "No measurement data",
    colInspect: "Inspection date",
    moveHist: "Install history (position·vehicle changes)",
    moveNone: "Only 1 install record (no changes)",
    mDate: "Install date",
    mVehicle: "Vehicle",
    mPos: "Position",
    mKind: "Type",
    mInstall: "First install",
    mMount: "Replacement install",
    mCurrent: "Current",
    excelDownload: "Excel download",
    kmLower: "lower bound",
    kmLowerTip: "Distance before mounting is unknown — no mount date and the first inspection was not a new tyre (or had no KM), so running before the first inspection is missing",
    avgExclLower: "average of {n} tyres excl. lower bound",
    colKmFlag: "km_flag",
    colKmMethod: "km_method",
    foot9a: "Running KM (lower bound)",
    foot9b: " = Segment boundary km comes from the KM entered at replacement → an inspection on the same day → date-proportional interpolation between the surrounding inspections. For initial fitments without a mount date, if the first inspection shows a new tyre (4-point average 22mm) that round is taken as the mount point and the whole run to removal is counted (FIRST_NEW_INSPECTION, not a lower bound). Only when the first inspection was not a new tyre or had no KM is the value a lower bound; the average row's running KM excludes those. Distance is measured regardless of tread — rounds with 0mm centre grooves still count as running",
  },
} as const);


/** 값 없음 표기 — 표·요약·모달이 같은 글자를 쓴다. */

// 원장 비고는 DB 자유 입력(한국어)이다. 알려진 문구만 id·en 으로 옮기고, 남은 한글은 lang="ko" 와 «KO» 표시로 구분한다.
const NOTE_TERMS: [string, { id: string; en: string }][] = [
  ["연속 교체 기재", { id: "penggantian beruntun tercatat", en: "consecutive replacements logged" }],
  ["원장 확인 대기", { id: "menunggu cek catatan asli", en: "awaiting ledger check" }],
];
function noteView(note: string, lang: string): { text: string; foreign: boolean } {
  if (lang === "ko") return { text: note, foreign: false };
  const text = NOTE_TERMS.reduce((t, [ko, tr]) => t.split(ko).join(lang === "id" ? tr.id : tr.en), note);
  return { text, foreign: /[가-힣]/.test(text) };
}

const STATUS_STYLE: Record<LifeRecord["status"], string> = {
  // Install 은 정상 상태라 색을 쓰지 않는다 — 녹색은 신호등(트레드·예상 KM 달성)에만, 붉은 행과 겹치지 않게
  Install: "text-foreground border-foreground/30 bg-card",
  Scrap: "text-level-danger border-level-danger/40 bg-level-danger/10",
  Spare: "text-level-warn border-level-warn/40 bg-level-warn/10",
  "Not Install": "text-muted-foreground border-border bg-muted/20",
};

export default function LifeTab({ focusSerial, onDataChanged }: { focusSerial?: string | null; onDataChanged?: () => void | Promise<void> }) {
  const { lang } = useLang();
  const { canDownload } = useAuth();
  // 문구에 임계치가 들어가므로 DB 로드 후 렌더 시점에 만든다.
  const tx = buildTX()[lang];
  // 예상 KM·HM 열의 수명 종료 기준 (T-3) — 열 머리·각주가 같은 값을 쓴다
  const basis = lifeEndBasis();

  // 폭 방향 4점. 열 순서(좌→중1→중2→우)는 확정이고, 차량 기준 외측/내측은
  // 미확정이라 방향 이름을 붙이지 않는다 (v3 §Q1 보류).
  const WIDTH_KEYS = [
    { k: "l" as const, label: tx.wL },
    { k: "c1" as const, label: tx.wC1 },
    { k: "c2" as const, label: tx.wC2 },
    { k: "r" as const, label: tx.wR },
  ];
  const [lifeFilter, setLifeFilter] = useState<string>("ALL");
  const today = todayInField();

  // DUE30 — 대시보드 「교체 준비 목록」과 같은 판정(prepDaysLeft)이라 건수가 일치한다.
  // 상태 필터와 AND 로 겹치는 토글 칩이다
  // 기준 이하(잔여 0 — 즉시) 와 30일 이내(잔여 있음)는 성격이 달라 칩을 나눈다. 서로 배타
  // 기본 뷰 = 기준 이하(발주·교체 대상). 「전체」는 명시 선택(all). 기준 이하가 0건이면 전체로 폴백
  // 칩 건수 — 상태 필터·검색과 무관하게 전체 기준 (칩을 켜면 목록이 줄어도 숫자는 그대로)
  const dueCount = { below: 0, soon: 0 };
  const belowByCh = new Map<string, number>();
  for (const l of TMS_DATA.life) {
    const d = prepDaysLeft(l.serial, l.status, today);
    if (d == null || d > PREP_WINDOW_DAYS) continue;
    const lc = lifeCalc(l.serial);
    if (lc?.projection.remainingKm === 0) {
      dueCount.below++;
      if (lc.ch) belowByCh.set(lc.ch, (belowByCh.get(lc.ch) ?? 0) + 1);
    } else dueCount.soon++;
  }
  const [dueSel, setDueSel] = useState<null | "below" | "soon" | "all">(null);
  const due: null | "below" | "soon" = dueSel === "all" ? null : dueSel ?? (dueCount.below > 0 ? "below" : null);
  // 기준 이하·≤30일 뷰는 장착 행만 담는다 — 상태 필터가 남으면 빈 결과가 되므로 풀어 둔다(select 도 숨김)
  const setDue = (v: null | "below" | "soon") => { setDueSel(v ?? "all"); if (v) setLifeFilter("ALL"); if (v === "below") setSort((s) => (s?.k === "rem" ? null : s)); };
  const [q, setQ] = useState("");
  const theadRef = useRef<HTMLTableSectionElement>(null);
  const [headH, setHeadH] = useState(40);
  // 차량 요약 칩 — 기준 이하 26행을 차량 단위 결정으로 줄여 본다. 기본 화면에서 눌러도 기준 이하로 진입한다
  const [chSel, setChSel] = useState<string | null>(null);
  /** 장착 차량·포지션 라벨 (예: "CH 824 · L1") — 계산 대상이 아니면 빈 문자열 */
  const whereOf = (serial: string) => {
    const c = lifeCalc(serial);
    return c ? `${c.ch} · ${c.pos}` : "";
  };
  const qn = q.trim().toLowerCase();
  const filtered = TMS_DATA.life.filter((l) => {
    if (lifeFilter !== "ALL" && l.status !== lifeFilter) return false;
    if (qn && !`${l.serial} ${whereOf(l.serial)}`.toLowerCase().includes(qn)) return false;
    if (due) {
      const d = prepDaysLeft(l.serial, l.status, today);
      if (d == null || d > PREP_WINDOW_DAYS) return false;
      const below = lifeCalc(l.serial)?.projection.remainingKm === 0;
      if (due === "below" && chSel && lifeCalc(l.serial)?.ch !== chSel) return false;
      return due === "below" ? below : !below;
    }
    return true;
  });

  // 정렬 — 기본: Install 먼저 + 예상 교체일 오름차순(날짜 없는 Install은 Install 끝), 나머지는 원장 순서.
  // 헤더 클릭: 오름 → 내림 → 기본으로 복귀. 값 없는 행은 항상 뒤
  // 기준 이하 뷰 — 잔여 KM 은 전 행 0 이라 열을 빼고, 예상 교체일 자리에 «마지막 측정»을 둔다
  const belowView = due === "below";
  type SortKey = "tread" | "rem" | "pdate";
  const [sort, setSort] = useState<{ k: SortKey; dir: "asc" | "desc" } | null>(null);
  const toggleSort = (k: SortKey) =>
    setSort((s) => (s?.k !== k ? { k, dir: "asc" } : s.dir === "asc" ? { k, dir: "desc" } : null));
  const sortVal = (l: LifeRecord, k: SortKey): number | string | null => {
    if (k === "tread") return latestTreadOf(l.serial);
    if (l.status !== "Install") return null;
    const p = lifeCalc(l.serial)?.projection;
    if (k === "rem") return p?.remainingKm ?? null;
    // 표시 규칙(prepDaysLeft)과 같게 — stale·미감시 행은 날짜가 있어도 값 없음으로 취급
    return prepDaysLeft(l.serial, l.status, today) == null ? null : p?.projectedDate ?? null;
  };
  // 동률 해소 — 같은 날짜(기준 이하 행은 전부 마지막 측정일)면 트레드가 낮은 행이 위. 값 없음은 뒤
  const byTread = (a: LifeRecord, b: LifeRecord) => {
    const ta = latestTreadOf(a.serial);
    const tb = latestTreadOf(b.serial);
    if (ta == null && tb == null) return 0;
    if (ta == null) return 1;
    if (tb == null) return -1;
    return ta - tb;
  };
  const sorted = sort
    ? [...filtered].sort((a, b) => {
        const va = sortVal(a, sort.k);
        const vb = sortVal(b, sort.k);
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        const r = va < vb ? -1 : va > vb ? 1 : 0;
        return r === 0 ? byTread(a, b) : sort.dir === "asc" ? r : -r;
      })
    : [...filtered].sort((a, b) => {
        const ia = a.status === "Install" ? 0 : 1;
        const ib = b.status === "Install" ? 0 : 1;
        if (ia !== ib) return ia - ib;
        if (ia === 1) return 0;
        // 기준 이하 목록은 차량 단위로 묶어 본다 — 차량 먼저, 그 안에서 날짜·트레드 순
        if (due === "below" && !chSel) {
          const ca = lifeCalc(a.serial)?.ch ?? "";
          const cb = lifeCalc(b.serial)?.ch ?? "";
          if (ca !== cb) return ca < cb ? -1 : 1;
        }
        const da = sortVal(a, "pdate") as string | null;
        const db = sortVal(b, "pdate") as string | null;
        if (da == null && db == null) return 0;
        if (da == null) return 1;
        if (db == null) return -1;
        return da < db ? -1 : da > db ? 1 : byTread(a, b);
      });

  // 기준 이하 뷰에서 모든 행의 마지막 측정일이 같으면 열 대신 표 위 한 줄로 — 같은 값 26개는 소음이다
  const lastDates = new Set<string>();
  let lastDateAll = belowView && sorted.length > 0;
  for (const l of sorted) {
    const d = l.status === "Install" ? lifeCalc(l.serial)?.projection.projectedDate : null;
    if (d) lastDates.add(d); else lastDateAll = false;
  }
  const sameDate = lastDateAll && lastDates.size === 1;
  const lastDate = sameDate ? [...lastDates][0] : null;
  const lastAge = lastDate && sorted[0] ? Math.max(0, -(prepDaysLeft(sorted[0].serial, sorted[0].status, today) ?? 0)) : 0;
  const showPdate = !sameDate;
  // 전체 뷰만 11열. ≤30일 뷰는 장착 행 몇 개라 HR·예상 HM·CPK·상태를 빼고 7열로 줄인다
  const soonView = due === "soon";
  const full = due === null;
  useEffect(() => {
    const el = theadRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeadH(el.offsetHeight));
    ro.observe(el);
    setHeadH(el.offsetHeight);
    return () => ro.disconnect();
  }, [belowView, lang, sorted.length > 0]);
  const colCount = full ? 11 : soonView ? 7 : showPdate ? 6 : 5;
  // 차량별 소제목 — 기본 정렬(차량 → 날짜)일 때만. 최저 트레드가 그 차량의 긴급도
  const groupHeads = belowView && !sort && !chSel;
  const chStat = new Map<string, { n: number; min: number | null }>();
  if (groupHeads) {
    for (const l of sorted) {
      const ch = lifeCalc(l.serial)?.ch ?? "";
      const t = latestTreadOf(l.serial);
      const g = chStat.get(ch) ?? { n: 0, min: null };
      g.n++;
      if (t != null && (g.min == null || t < g.min)) g.min = t;
      chStat.set(ch, g);
    }
  }
  const activeFilterText = [
    due === "below" ? tx.projBelow : due === "soon" ? tx.due30 : null,
    chSel ? `CH ${chSel}` : null,
    qn ? `"${q.trim()}"` : null,
    lifeFilter !== "ALL" ? lifeFilter : null,
  ].filter(Boolean).join(" · ");

  /** 예상 교체일을 못 낸 사유 — 셀 툴팁 */
  const projWhyKey = (c: LifeCalc | null, hmReset: boolean | undefined) =>
    c ? (c.projection.reason ?? null) : hmReset ? "hm_reset" as const : "no_data" as const;
  const projWhy = (c: LifeCalc | null, hmReset: boolean | undefined) => {
    const k = projWhyKey(c, hmReset);
    return k ? tx.projWhy[k] : "";
  };

  // 시리얼 포커스(다른 페이지/교체이력 탭에서 시리얼 클릭) → 해당 행 스크롤·하이라이트
  const focusRow = useRef<HTMLTableRowElement | null>(null);
  const [target, setTarget] = useState<string | null>(focusSerial ?? null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState(0); // 동일 시리얼 반복 클릭에도 재동작

  useEffect(() => {
    if (focusSerial) { setLifeFilter("ALL"); setTarget(focusSerial); setFocusKey((k) => k + 1); }
  }, [focusSerial]);

  useEffect(() => {
    if (!target) return;
    focusRow.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlight(target);
    const t = setTimeout(() => setHighlight(null), 2600);
    return () => clearTimeout(t);
  }, [target, focusKey]);

  // 행 클릭 → 타이어 전체 히스토리 모달
  const [historyOf, setHistoryOf] = useState<string | null>(null);
  const hist = historyOf ? tireHistory(historyOf) : null;
  const moves = historyOf ? tireMovements(historyOf) : [];
  // 요약의 4점 — hist 안에서 한 번 꺼내 둔다(렌더 안에서 non-null 단언을 쓰지 않도록).
  const latestW = hist?.latestWidths ?? null;

  // 손상 코드 모달 (코드 클릭 시 열기, hiCode = 강조할 코드)
  const [showCodes, setShowCodes] = useState(false);
  const [hiCode, setHiCode] = useState<string | null>(null);
  const openCodes = (code: string | null) => { setHiCode(code); setShowCodes(true); };

  // 표시 행(필터 적용)의 평균값 — 최근 트레드 / 주행 KM·HR / 예상 KM·HM
  const avg = (() => {
    const acc = { tread: [0, 0], kmExact: [0, 0], hr: [0, 0], ekm: [0, 0], ehm: [0, 0], rem: [0, 0], cpk: [0, 0] };
    // CPK 평균은 통화가 하나일 때만 낸다 — IDR 과 USD 를 섞어 더하면 의미가 없다.
    const curs = new Set<string>();
    const add = (slot: number[], v: number | null | undefined) => { if (v != null) { slot[0] += v; slot[1]++; } };
    filtered.forEach((l) => {
      const c = lifeCalc(l.serial);
      const noExp = l.status === "Scrap" || l.status === "Not Install";
      add(acc.tread, latestTreadOf(l.serial));
            // 평균행 주행 KM = 하한값 제외 평균 (T-2) — 장착일 이전 주행이 빠진 개체는 실제보다 작아 평균을 끌어내린다.
      // 전체 평균을 대체한다 (사용자 결정 2026-10-16, decisions M-4)
      if (c && !c.kmIsLowerBound) add(acc.kmExact, c.km);
      add(acc.hr, c?.hr);
      if (!noExp) add(acc.ekm, c?.expectedKm);
      if (!noExp) add(acc.ehm, c?.expectedHm);
      if (l.status === "Install") add(acc.rem, c?.projection.remainingKm);
      const cost = tireCostOf(l.serial);
      if (cost?.cpk != null) { add(acc.cpk, cost.cpk); curs.add(cost.currency); }
    });
    const m = (s: number[]) => (s[1] > 0 ? s[0] / s[1] : null);
    const cpkCur = curs.size === 1 ? [...curs][0] : null;
    return { tread: m(acc.tread), kmExact: m(acc.kmExact), kmExactN: acc.kmExact[1], hr: m(acc.hr), ekm: m(acc.ekm), ehm: m(acc.ehm), rem: m(acc.rem),
      cpk: cpkCur ? m(acc.cpk) : null, cpkCur: cpkCur ?? "IDR" };
  })();
  // 현재 필터·정렬 상태 그대로 엑셀(.xlsx)로 내보내기 (xlsx는 클릭 시 동적 로드)
  // 현재 필터에 표시된 행을 엑셀(.xlsx)로 내보내기 (xlsx는 클릭 시 동적 로드)
  const exportExcel = async () => {
    const rows = filtered.map((l) => {
      const c = lifeCalc(l.serial);
      const cost = tireCostOf(l.serial);
      const noExpected = l.status === "Scrap" || l.status === "Not Install";
      const installed = l.status === "Install";
      const unit = findUnitBySerial(l.serial);
      const monitored = !!unit;
      const tread = latestTreadOf(l.serial);
      const treadAvg = latestTreadAvgOf(l.serial);
      const damage = l.damage && l.damage !== "-" ? l.damage : null;
      const noteParts: string[] = [];
      if (!monitored) noteParts.push(tx.nonMeasured);
      if (damage) noteParts.push(codeName(damage));
      if (l.note) noteParts.push(l.note);
      if (unit?.hmReset) noteParts.push(tx.hmReset);
      return {
        [tx.colNo]: l.no,
        [tx.colSerial]: l.serial,
        [tx.colInstall]: fmtD(l.install),
        [tx.colTread]: tread != null ? Number(tread.toFixed(1)) : "",
        [tx.colTreadAvg]: treadAvg != null ? Number(treadAvg.toFixed(1)) : "",
        [tx.colKm]: c?.km ?? "",
        [tx.colHr]: c?.hr ?? "",
        // 원장 구간별 산출 근거 — 구간이 여럿이면 장착 순으로 잇는다 (T-2)
        [tx.colKmFlag]: ledgerOf(l.serial).map((g) => g.kmFlag).join(" → "),
        [tx.colKmMethod]: ledgerOf(l.serial).map((g) => g.kmMethod ?? EMPTY).join(" → "),
        [tx.expKmBasis[basis]]: c?.expectedKm != null && !noExpected ? c.expectedKm : "",
        [tx.expHmBasis[basis]]: c?.expectedHm != null && !noExpected ? c.expectedHm : "",
        // 엑셀은 계산이 되도록 숫자로 낸다. 통화는 옆 열 — 행마다 다를 수 있다
        [tx.colCurrency]: cost?.total != null ? cost.currency : "",
        [tx.colTotalCost]: cost?.total ?? "",
        [tx.colCpk]: cost?.cpk != null ? Number(cost.cpk.toFixed(4)) : "",
        [tx.colExpCpk]: cost?.expCpk != null ? Number(cost.expCpk.toFixed(4)) : "",
        [tx.colWearRate]: c?.projection.wearRateKm != null ? Number(c.projection.wearRateKm.toFixed(3)) : "",
        [tx.colKmPerMm]: (() => { const k = kmPerMmOf(c?.projection.wearRateKm); return k == null ? "" : Math.round(k); })(),
        [tx.colRemKm]: installed && c?.projection.remainingKm != null ? Math.round(c.projection.remainingKm) : "",
        [tx.colProjDate]: installed ? c?.projection.projectedDate ?? "" : "",
        [tx.colStatus]: l.status,
        [tx.colNote]: noteParts.join(" · "),
        // 수명 종료 기준 3종 비교 (T-3 기본값 결정 자료) — 화면 기준과 무관하게 모두 낸다
        [tx.cmpPrefix + tx.expKmBasis.min]: c?.expectedByBasis.min.km ?? "",
        [tx.cmpPrefix + tx.expKmBasis.three_zero]: c?.expectedByBasis.three_zero.km ?? "",
        [tx.cmpPrefix + tx.expKmBasis.four_zero]: c?.expectedByBasis.four_zero.km ?? "",
      };
    });
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 5 }, { wch: 20 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 18 }, { wch: 24 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 28 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Lifetime DB");
    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    XLSX.writeFile(wb, `TireLifetimeDB_${stamp}.xlsx`);
  };

  // Esc · 포커스 (COM-03)
  const codesRef = useDialog(showCodes, () => setShowCodes(false));
  const histRef = useDialog(!!hist, () => setHistoryOf(null));
  const closeLabel = DICT[lang]["common.close"];

  return (
    <div className="space-y-4">
      {/* 배치도에서 시리얼을 클릭해 들어온 경우 — v_tire_detail 단건 상세.
          수명 DB에 없는 시리얼이면 아래 표에 행이 없으므로 이 카드가 유일한 표시원이다. */}
      {target && <TireDetailCard key={target} serial={target} />}

      {/* Lifetime DB */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <h2 className="text-base font-bold text-foreground">{tx.dbTitle}</h2>
          <span className="font-mono text-xs tabular-nums bg-muted px-2 py-0.5 rounded-full whitespace-nowrap">
            {filtered.length}{tx.pcs} / {due === "below" ? dueCount.below : due === "soon" ? dueCount.soon : TMS_DATA.life.length}{tx.pcs}
          </span>
          {/* 보기 전환 — 한 컨트롤 안의 세 선택지. 누른 칸을 다시 눌러도 그대로(토글 아님) */}
          <div role="group" aria-label={tx.viewGroup} className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted/30 p-0.5">
            {([[null, tx.viewAll, TMS_DATA.life.length], ["below", tx.projBelow, dueCount.below], ["soon", tx.due30, dueCount.soon]] as const).map(([k, label, n]) => {
              const on = due === k;
              const tone = k === "below" ? "bg-level-danger/15 ring-level-danger" : k === "soon" ? "bg-level-order/20 ring-level-order" : "bg-primary/15 ring-primary";
              return (
                <button
                  key={k ?? "all"}
                  type="button"
                  aria-pressed={on}
                  onClick={() => { setDue(k); setChSel(null); }}
                  className={`relative h-8 px-3 rounded-md text-xs whitespace-nowrap transition-colors after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${on ? `${tone} ring-1 ring-inset text-foreground font-bold` : "text-foreground font-semibold hover:bg-muted"}`}
                >
                  {label}<span className="sr-only">: </span><span className="ml-1 font-mono tabular-nums">{n}</span>
                </button>
              );
            })}
          </div>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={tx.searchPh}
            aria-label={tx.searchPh}
            className="text-xs bg-muted/30 border border-border rounded-lg px-3 h-9 w-44 focus-visible:outline-2 focus-visible:outline-primary"
          />
          {sort && (
            <button type="button" onClick={() => setSort(null)} className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground min-h-9 px-1 rounded focus-visible:outline-2 focus-visible:outline-primary">
              {tx.sortReset}
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            {/* 상태 필터는 전체 뷰에서만 — 다른 두 뷰는 장착 행뿐이다 */}
            {full && <select
              value={lifeFilter}
              aria-label={tx.status}
              onChange={(e) => setLifeFilter(e.target.value)}
              className="text-xs bg-muted/30 border border-border rounded-lg px-3 h-9 text-foreground font-semibold focus-visible:outline-2 focus-visible:outline-primary"
            >
              <option value="ALL">{tx.all}</option>
              <option value="Install">{tx.statusName["Install"]}</option>
              <option value="Scrap">{tx.statusName["Scrap"]}</option>
              <option value="Spare">{tx.statusName["Spare"]}</option>
              <option value="Not Install">{tx.statusName["Not Install"]}</option>
            </select>}
            {/* 엑셀 다운로드 — 로그인한 모든 사용자(조회 권한 포함) */}
            {canDownload && (
              <button
                onClick={exportExcel}
                className="inline-flex items-center gap-1 text-xs font-bold px-3 h-9 rounded-lg bg-level-ok text-white hover:bg-level-ok/85 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <Download className="w-3.5 h-3.5" />
                {tx.excelDownload}
              </button>
            )}
          </div>
        </div>
        {belowView && belowByCh.size > 0 && (
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-3 pb-3" role="group" data-ch-chips aria-label={tx.projBelow}>
            {[null, ...[...belowByCh.keys()].sort()].map((ch) => {
              const on = chSel === ch;
              return (
                <button
                  key={ch ?? "all"}
                  type="button"
                  aria-pressed={on}
                  onClick={() => { setDue("below"); setChSel(ch); }}
                  className={`relative text-xs px-3 min-h-8 rounded-full border transition-colors after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${on ? "bg-primary/15 border-primary ring-1 ring-primary text-foreground font-bold" : "bg-muted/30 text-foreground border-border hover:bg-muted"}`}
                >
                  {ch ? `CH ${ch}` : tx.chipChAll}<span className="sr-only">: </span><span className="ml-1 font-mono tabular-nums">{ch ? belowByCh.get(ch) : dueCount.below}</span>
                </button>
              );
            })}
          </div>
        )}
        {belowView && sorted.length > 0 && (
          <p className="pb-2 text-[11px] text-muted-foreground">
            {tx.belowNote.replace("{mm}", fmtTread(treadThresholds().order, false))}
            {lastDate && <> · {tx.lastMeasAll.replace("{d}", lastDate).replace("{n}", fmtInt(lastAge))}</>}
            {" · "}{tx.detailHint}
          </p>
        )}
        <div role="status" className="sr-only">{sorted.length === 0 ? tx.noMatch : `${fmtInt(sorted.length)}${tx.pcs}`}</div>
        {full && sorted.length > 0 && <p className="hidden max-[999px]:block pb-2 text-[11px] text-muted-foreground">{tx.colsHidden}</p>}
        <div className="overflow-auto max-h-[70vh]">
          <table aria-label={tx.tableLabel} className="w-full min-w-240 max-[999px]:min-w-160 table-fixed text-xs border-collapse font-mono">
            <colgroup>
              {/* 상태 열은 'Not Install' 이 한 줄로 들어갈 만큼 준다(9%). 합계 100%.
                  No·최초 장착일은 표에서 뺐다 — 행 모달(이력)에 장착일이 있고 No 는 엑셀에 남는다 */}
              {/* 1000px 미만: 주행 HR(3)·CPK(6) 열을 접는다 — 값은 행 모달에서 확인. 남는 폭은 시리얼·교체일·비고로 */}
              {/* ≤30일 뷰 7열 / 기준 이하 6·5열 — 비고는 대부분 빈칸이라 숫자 열보다 넓게 두지 않는다 */}
              {(full ? [
                "w-[11%] max-[999px]:w-[15%]",
                "w-[8%] max-[999px]:w-[10%]",
                "w-[8%] max-[999px]:w-[9%]",
                "w-[7%] max-[999px]:hidden",
                "w-[7.5%] max-[999px]:w-[8.75%]",
                "w-[7.5%] max-[999px]:w-[8.75%]",
                "w-[13%] max-[999px]:hidden",
                "w-[9%] max-[999px]:w-[11.5%]",
                "w-[10%] max-[999px]:w-[15.5%]",
                "w-[10%] max-[999px]:hidden",
                "w-[9%] max-[999px]:w-[21.5%]",
              ] : soonView ? [
                "w-[16%]",
                "w-[11%]",
                "w-[12%]",
                "w-[12%]",
                "w-[12%]",
                "w-[15%]",
                "w-[22%]",
              ] : showPdate ? [
                "w-[18%]",
                "w-[14%]",
                "w-[15%]",
                "w-[15%]",
                "w-[15%]",
                "w-[23%]",
              ] : [
                "w-[20%]",
                "w-[16%]",
                "w-[17%]",
                "w-[17%]",
                "w-[30%]",
              ]).map((cls, i) => (
                <col key={i} className={cls} />
              ))}
            </colgroup>
            <thead ref={theadRef} className="sticky top-0 z-10">
              <tr>
                {[
                  { k: "serial", label: tx.colSerial, align: "text-left" },
                  { k: "tread", label: tx.colTread, align: "text-right", sort: "tread" as SortKey },
                  { k: "km", label: tx.colKm, align: "text-right" },
                  ...(full ? [{ k: "hr", label: tx.colHr, align: "text-right" }] : []),
                  { k: "ekm", label: tx.expKmBasis[basis], align: "text-right" },
                  ...(full ? [{ k: "ehm", label: tx.expHmBasis[basis], align: "text-right" }, { k: "cpk", label: tx.colCpk, align: "text-right" }] : []),
                  ...(belowView ? [] : [{ k: "rem", label: tx.colRemKm, align: "text-right", sort: "rem" as SortKey }]),
                  ...(showPdate ? [{ k: "pdate", label: belowView ? tx.colLastMeas : tx.colProjDate, align: "text-right", sort: "pdate" as SortKey }] : []),
                  ...(full ? [{ k: "status", label: tx.colStatus, align: "text-center" }] : []),
                  { k: "note", label: tx.colNote, align: "text-left" },
                ].map((h: { k: string; label: string; align: string; sort?: SortKey }) => (
                  <th
                    key={h.k}
                    scope="col"
                    title={h.k === "ekm" ? tx.tipEkm : h.k === "rem" ? tx.tipRem : undefined}
                    aria-sort={h.sort ? (sort?.k === h.sort ? (sort.dir === "asc" ? "ascending" : "descending") : "none") : undefined}
                    className={`bg-card border-b border-border px-2 py-2 max-[999px]:px-1 max-[999px]:text-[11px] text-muted-foreground font-semibold whitespace-normal break-keep align-bottom leading-tight ${h.k === "hr" || h.k === "cpk" || h.k === "status" ? "max-[999px]:hidden " : ""}${h.k === "serial" ? "sticky left-0 z-20" : ""} ${h.align}`}
                  >
                    {(() => {
                      // «예상 KM (최소 0mm)» → 주 라벨 / 조건 2줄. 조건은 보조 정보라 작게
                      const i = h.label.indexOf(" (");
                      const inner = i < 0 ? h.label : (
                        <>
                          {h.label.slice(0, i)}
                          <span className="block text-[11px] font-normal">{h.label.slice(i + 1)}</span>
                        </>
                      );
                      if (!h.sort) return inner;
                      const k = h.sort;
                      const Icon = sort?.k === k ? (sort.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
                      return (
                        <button
                          type="button"
                          onClick={() => toggleSort(k)}
                          className="inline-flex items-end gap-1 min-h-7 text-right font-semibold hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary rounded"
                        >
                          <span>{inner}</span>
                          <Icon className={`w-3 h-3 shrink-0 mb-0.5 ${sort?.k === k ? "text-foreground" : ""}`} aria-hidden="true" />
                        </button>
                      );
                    })()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={colCount} className="px-2 py-8 text-center font-sans text-muted-foreground">
                    <div className="font-semibold text-foreground">{tx.noMatch}</div>
                    {activeFilterText && <div className="text-xs mt-0.5">{tx.activeFilters.replace("{f}", activeFilterText)}</div>}
                    <button
                      type="button"
                      onClick={() => { setQ(""); setDue(null); setChSel(null); setLifeFilter("ALL"); }}
                      className="mt-1 min-h-7 px-2 underline underline-offset-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary rounded"
                    >
                      {tx.clearAll}
                    </button>
                  </td>
                </tr>
              )}
              {sorted.map((l, idx) => {
                const c = lifeCalc(l.serial);
                const cost = tireCostOf(l.serial);
                const noExpected = l.status === "Scrap" || l.status === "Not Install";
                const unit = findUnitBySerial(l.serial);
                const hmReset = unit?.hmReset;
                // 보정값(§A-9)이 들어간 리셋 차량은 예측이 되므로 사유를 리셋으로 돌리지 않는다
                const hmUnresolved = meterUnresolved(unit);
                const monitored = !!unit; // 모니터링 5대 장착 여부 (아니면 측정 외)
                const tread = latestTreadOf(l.serial);
                const treadAvg = latestTreadAvgOf(l.serial);
                const treadCls = tread == null ? "" : TREAD_CLS[treadLevel(tread)];
                const damage = l.damage && l.damage !== "-" ? l.damage : null;
                const isFocus = highlight != null && l.serial === highlight;
                const installed = l.status === "Install";
                const proj = installed ? c?.projection ?? null : null;
                const daysLeft = installed ? prepDaysLeft(l.serial, l.status, today) : null;
                const dateCls = daysLeft == null ? "" : daysLeft <= PREP_URGENT_DAYS
                  ? "text-level-danger font-bold" : daysLeft <= PREP_WINDOW_DAYS ? "text-level-warn font-bold" : "text-foreground";
                const why = installed && !(proj?.projectedDate && daysLeft != null)
                  ? (proj?.projectedDate ? tx.projExcluded : projWhy(c, hmUnresolved)) : "";
                const chHere = lifeCalc(l.serial)?.ch ?? "";
                const newGroup = groupHeads && (idx === 0 || (lifeCalc(sorted[idx - 1].serial)?.ch ?? "") !== chHere);
                const gs = newGroup ? chStat.get(chHere) : undefined;
                return (
                <Fragment key={l.no}>
                {gs && (
                  <tr className="border-b border-border">
                    <th colSpan={colCount} scope="colgroup" style={{ top: headH }} className="sticky z-5 bg-muted px-2 py-1 text-left text-[11px] font-bold text-foreground font-sans">
                      CH {chHere}<span className="font-normal text-muted-foreground"> · {fmtInt(gs.n)}{tx.pcs}{gs.min != null && <> · {tx.minLabel} {fmtTread(gs.min, false)} mm</>}</span>
                    </th>
                  </tr>
                )}
                <tr
                  ref={l.serial === target ? focusRow : undefined}
                  onClick={() => setHistoryOf(l.serial)}
                  // 행 자체에 포커스가 있을 때만 — 안쪽 버튼(손상 코드)의 Enter 가 위로 번져 모달이 겹쳐 열리지 않게 한다
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      setHistoryOf(l.serial);
                    }
                  }}
                  className={`border-b border-border/30 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-primary focus-visible:-outline-offset-2 ${isFocus ? "bg-primary/10 ring-2 ring-primary/50" : `hover:bg-muted/10 ${!monitored ? "bg-muted/10" : ""}`}`}
                >
                  <td className="px-2 max-[999px]:px-1 py-1.5 text-[11px] max-w-35 sticky left-0 z-1 bg-card">
                    {!full && c ? (
                      <>
                        {/* 현장 정비사는 위치로 타이어를 찾는다 — 위치 1순위, 시리얼은 보조 */}
                        <div className="text-xs font-bold text-foreground leading-tight whitespace-nowrap">{c.ch} · {c.pos}</div>
                        <div className="truncate text-muted-foreground leading-tight" title={l.serial}>{l.serial}<span className="sr-only"> · {tx.rowOpen}</span></div>
                      </>
                    ) : (
                      <>
                        <div className="truncate" title={l.serial}>{l.serial}<span className="sr-only"> · {tx.rowOpen}</span></div>
                        {c && <div className="text-muted-foreground leading-tight whitespace-nowrap">{c.ch} · {c.pos}</div>}
                        {/* 1000px 미만은 상태 열을 접는다 — 장착 외(폐기·예비·미장착)만 여기 한 줄로. 장착은 위치 줄이 이미 말한다 */}
                        {full && l.status !== "Install" && (
                          <div className="hidden max-[999px]:block font-sans font-semibold text-muted-foreground leading-tight whitespace-nowrap">{tx.statusName[l.status]}</div>
                        )}
                      </>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    {tread != null ? (
                      <>
                        <span className={`${treadCls}${belowView ? ` text-sm ${treadLevel(tread) === "danger" ? "font-bold" : "font-medium"}` : ""}`}>{installed && (treadLevel(tread) === "danger" || (!belowView && treadLevel(tread) === "order")) && <AlertTriangle className="inline w-3 h-3 mr-0.5 -mt-0.5" aria-hidden="true" />}{fmtTread(tread, false)}<span className="text-muted-foreground ml-0.5">mm</span></span>
                        {/* 4점 평균 병기 — 최소값이 0.0 이어도 숄더가 남았는지 여기서 보인다.
                            판정·색상은 위의 최소값이 그대로 쥔다. 평균은 읽기 보조일 뿐이다.
                            평균이 최소값과 같으면(4점이 모두 동일) 줄만 차지하므로 생략한다. */}
                        {treadAvg != null && treadAvg !== tread && (
                          <div className="text-[11px] text-muted-foreground leading-tight">
                            {tx.avgPrefix}{fmtTread(treadAvg, false)}
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="text-muted-foreground">{EMPTY}</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    {c?.km != null ? (
                      <>
                        <span className="font-bold">{fmtInt(c.km)}</span>
                        {/* TCO 탭 개체 원장과 같은 표기 — 숫자만 보면 하한값인지 알 수 없다 (T-2) */}
                        {c.kmIsLowerBound && (
                          <div className="text-[11px] leading-tight text-level-warn" title={tx.kmLowerTip}>
                            ({tx.kmLower})
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="text-muted-foreground">{EMPTY}</span>
                    )}
                  </td>
                  {full && (
                  <>
                    <td className="px-2 py-1.5 text-right max-[999px]:hidden">
                      {c?.hr != null ? (
                        <span className="text-foreground">{fmtInt(c.hr)}</span>
                      ) : (
                        <span className="text-muted-foreground">{EMPTY}</span>
                      )}
                    </td>
                  </>
                  )}
                  <td className="px-2 py-1.5 text-right">
                    {belowView && installed && c?.expectedKm != null && c?.km != null && Math.round(c.expectedKm) <= Math.round(c.km) ? (
                      // 거리 KM 과 같은 숫자를 되풀이하지 않는다 — 이미 0 mm 예상치에 닿은 행
                      <>
                        <span className="text-muted-foreground">{EMPTY}</span>
                        <div className="text-[11px] font-sans leading-tight text-muted-foreground break-keep" title={tx.estReachedTip}>{tx.estReached}<span className="sr-only"> : {tx.estReachedTip}</span></div>
                      </>
                    ) : c?.expectedKm != null && !noExpected ? (
                      <span className={`font-bold ${c.expectedKm >= targetLifeKm() && !c.kmIsLowerBound && c.projection.remainingKm !== 0 ? "text-level-ok" : ""}`}>{fmtInt(c.expectedKm)}</span>
                    ) : (
                      <span className="text-muted-foreground">{EMPTY}</span>
                    )}
                    {/* «—» 의 사유 — 툴팁만으로는 키보드·터치에서 안 보인다. 장착 중인데 예상 KM 이 비는 경우만 */}
                    {belowView && installed && !noExpected && c?.expectedKm == null && (() => {
                      const k = projWhyKey(c ?? null, hmReset) ?? (hmUnresolved ? "hm_reset" as const : "none" as const);
                      return k ? <div className="text-[11px] font-sans leading-tight text-muted-foreground break-keep" title={tx.projWhy[k]}>{tx.projWhyShort[k]}<span className="sr-only"> : {tx.projWhy[k]}</span></div> : null;
                    })()}
                    {/* 4점 기준인데 4점 회차가 2개 미만 — 비운 이유를 보인다 (T-3) */}
                    {!noExpected && basis !== "min" && c?.fourPointShort && (
                      <div className="text-[11px] leading-tight text-level-warn" title={tx.fourPointShortTip}>
                        {tx.fourPointShort}
                      </div>
                    )}
                  </td>
                  {full && (
                  <>
                    <td className="px-2 py-1.5 text-right">
                      {c?.expectedHm != null && !noExpected ? (
                        <span className="font-bold">{fmtInt(c.expectedHm)}</span>
                      ) : (
                        <span className="text-muted-foreground">{EMPTY}</span>
                      )}
                    </td>
                    {/* CPK (§B-1) — 단가 미입력이면 − (0 이 아님). 예상 CPK 는 아래 줄에 작게 */}
                    <td className="px-2 py-1.5 text-right whitespace-nowrap max-[999px]:hidden">
                      {cost?.cpk != null ? (
                        <span className="text-foreground">{fmtCpk(cost.cpk, cost.currency)}</span>
                      ) : (
                        <span className="text-muted-foreground">{EMPTY}</span>
                      )}
                      {cost?.expCpk != null && (
                        <div className="text-[11px] text-muted-foreground leading-tight">{tx.cpkExpPrefix}{fmtCpk(cost.expCpk, cost.currency)}</div>
                      )}
                    </td>
                  </>
                  )}
                  {!belowView && (
                    <td className="px-2 py-1.5 text-right" title={proj?.remainingKm ? tx.remAsOf : undefined}>
                      {proj?.remainingKm != null && proj.remainingKm > 0 ? (
                        <span className="text-foreground">{fmtInt(proj.remainingKm)}</span>
                      ) : (
                        <span className="text-muted-foreground" title={why || undefined}>{EMPTY}</span>
                      )}
                    </td>
                  )}
                  {showPdate && (
                    <td className="px-2 py-1.5 text-right" title={why || (proj?.remainingKm === 0 ? `${tx.projBelowTitle} (${tx.projLast.replace("{d}", proj.projectedDate ?? "")})` : daysLeft != null && daysLeft < 0 ? tx.projOverTitle : undefined)}>
                      {proj?.projectedDate && daysLeft != null ? (
                        <>
                          {proj.remainingKm === 0 && belowView ? (
                            // 마지막 측정 열 — 날짜와 경과일만. 조치(즉시)는 뷰 자체가 말한다
                            <>
                              <span className="text-foreground whitespace-nowrap">{proj.projectedDate}</span>
                              <div className="text-[11px] text-muted-foreground leading-tight whitespace-nowrap">
                                {tx.agoDays.replace("{n}", fmtInt(Math.max(0, -daysLeft)))}
                              </div>
                            </>
                          ) : proj.remainingKm === 0 ? (
                            // 기준 이하 — 날짜는 예측이 아니라 '마지막 측정일'이라 회색 사실로 낮추고, 조치(즉시)만 강조한다
                            <>
                              <span className="text-level-danger font-bold whitespace-nowrap">{tx.projNow}</span>
                              <div className="text-[11px] text-muted-foreground leading-tight whitespace-nowrap">
                                {tx.projLastAge.replace("{n}", fmtInt(Math.max(0, -daysLeft)))}
                              </div>
                            </>
                          ) : (
                            <>
                              <span className={`${dateCls} whitespace-nowrap`}>
                                {daysLeft <= PREP_URGENT_DAYS ? <AlertTriangle className="inline w-3 h-3 mr-0.5 -mt-0.5" aria-hidden="true" />
                                  : daysLeft <= PREP_WINDOW_DAYS ? <AlertCircle className="inline w-3 h-3 mr-0.5 -mt-0.5" aria-hidden="true" /> : null}
                                {proj.projectedDate}
                              </span>
                              <div className="text-[11px] text-muted-foreground leading-tight">
                                {daysLeft < 0
                                  ? tx.projOver.replace("{n}", fmtInt(-daysLeft))
                                  : tx.projDays.replace("{n}", fmtInt(daysLeft))}
                              </div>
                            </>
                          )}
                        </>
                      ) : (
                        <>
                          <span className="text-muted-foreground">{EMPTY}</span>
                          {why && <div className="text-[11px] font-sans text-muted-foreground leading-tight break-keep">{why}</div>}
                        </>
                      )}
                    </td>
                  )}
                  {full && (
                  <>
                    <td className="px-2 py-1.5 text-center max-[999px]:hidden">
                      <span
                        className={`inline-block whitespace-nowrap text-[11px] font-bold px-2 py-0.5 rounded-full border ${STATUS_STYLE[l.status]}`}
                      >
                        {tx.statusName[l.status]}
                      </span>
                    </td>
                  </>
                  )}
                  {/* 비고 — 조각 사이에 실제 ' · ' 문자를 넣는다.
                      여백(margin)만으로 띄우면 복사·스크린리더에서 '측정 외850 R2i' 처럼 붙는다. */}
                  <td className="px-2 py-1.5 text-[11px] text-muted-foreground text-left font-sans break-keep" title={l.note || undefined}>
                    <div className="line-clamp-2">
                    {[
                      !monitored && <span key="nm" className="text-[11px] text-muted-foreground border border-border/60 rounded px-1.5 py-0.5 align-middle">{tx.nonMeasured}</span>,
                      damage && <button key="dmg" className="text-destructive font-bold hover:underline inline-block min-h-6 px-1 -my-1 align-middle" onClick={(e) => { e.stopPropagation(); openCodes(damage); }}>{codeName(damage)}</button>,
                      l.note && (() => {
                        const n = noteView(l.note, lang);
                        return <span key="note" lang={n.foreign ? "ko" : undefined}>{n.foreign && <span className="text-[10px] border border-border/60 rounded px-1 mr-1 align-middle">KO</span>}{n.text}</span>;
                      })(),
                      hmReset && (hmUnresolved
                        ? <span key="hmr" className="text-level-warn font-semibold">{tx.hmReset}</span>
                        : <span key="hmr" className="text-muted-foreground" title={tx.hmResetFixedTitle}>{tx.hmResetFixed}</span>),
                    ].filter(Boolean).map((node, i) => (
                      <Fragment key={i}>{i > 0 && " · "}{node}</Fragment>
                    ))}
                    </div>
                  </td>
                </tr>
                </Fragment>
                );
              })}
            </tbody>
            {sorted.length > 0 && <tfoot>
              <tr className="border-t-2 border-border bg-muted/30 font-bold">
                <td className="px-2 py-2 text-muted-foreground">{tx.avg}</td>
                <td className="px-2 py-2 text-right">{avg.tread != null ? <span>{fmtTread(avg.tread, false)}<span className="text-muted-foreground ml-0.5">mm</span></span> : EMPTY}</td>
                <td className="px-2 py-2 text-right">
                  {fmtInt(avg.kmExact)}
                  {avg.kmExactN > 0 && (
                    <div className="text-[11px] font-normal font-sans leading-tight text-muted-foreground break-keep">
                      ({tx.avgExclLower.replace("{n}", fmtInt(avg.kmExactN))})
                    </div>
                  )}
                </td>
                {full && <td className="px-2 py-2 text-right max-[999px]:hidden">{fmtInt(avg.hr)}</td>}
                <td className="px-2 py-2 text-right">{fmtInt(avg.ekm)}</td>
                {full && <td className="px-2 py-2 text-right">{fmtInt(avg.ehm)}</td>}
                {full && <td className="px-2 py-2 text-right whitespace-nowrap max-[999px]:hidden">{fmtCpk(avg.cpk, avg.cpkCur)}</td>}
                {!belowView && <td className="px-2 py-2 text-right">{fmtInt(avg.rem)}</td>}
                {showPdate && <td />}{full && <td className="max-[999px]:hidden" />}<td />
              </tr>
            </tfoot>}
          </table>
        </div>
        <details className="mt-3 text-[11px] text-muted-foreground leading-relaxed">
          <summary className="cursor-pointer font-semibold text-foreground min-h-6 py-1">{tx.footMore}</summary>
          <div className="mt-1 space-y-1.5">
            <p>
              <strong className="text-foreground">{tx.foot2a.replace("{km}", fmtInt(targetLifeKm()))}</strong>{tx.foot2b}
            </p>
            <p>
              <strong className="text-foreground">{tx.foot4a}</strong>{tx.foot4b}<span className="font-mono">{EMPTY}</span>{tx.foot4c}
            </p>
            <p>
              <strong className="text-foreground">{tx.foot9a}</strong>{tx.foot9b}
            </p>
            <p>
              <strong className="text-foreground">{tx.foot1a}</strong>{tx.foot1b}
            </p>
            <p>
              <strong className="text-foreground">{tx.foot3a}</strong>{tx.foot3b}<strong className="text-foreground">{tx.foot3c}</strong>{tx.foot3d}<strong className="text-foreground">{tx.foot3dMin}</strong>{tx.foot3d2}<strong className="text-foreground">{tx.foot3dAvg}</strong>{tx.foot3d3}
            </p>
            <p>
              {tx.foot5}{tx.foot5Basis[basis]}
            </p>
            <p>
              <strong className="text-foreground">{tx.foot8a}</strong>{tx.foot8b}
            </p>
            <p>
              <span className="border border-border/60 rounded px-1.5 py-0.5">{tx.foot6a}</span>{tx.foot6b}<span className="font-mono">{EMPTY}</span>{tx.foot6c}
            </p>
            <p>
              {tx.foot7a}<strong className="text-destructive">{tx.foot7b}</strong>{tx.foot7c}<button type="button" className="inline-flex items-center min-h-6 px-1 -my-1 text-primary hover:underline font-semibold focus-visible:outline-2 focus-visible:outline-primary rounded" onClick={() => openCodes(null)}>{tx.foot7d}</button>
            </p>
          </div>
        </details>
      </div>

      {/* 손상 코드 모달 (표의 손상 코드 클릭 또는 '손상 코드 전체 보기'로 열림) */}
        {showCodes && (
          <div
            className="overlay-in fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
            onClick={() => setShowCodes(false)}
          >
            <div
              ref={codesRef} role="dialog" aria-modal="true" aria-label={tx.codesTitle} tabIndex={-1}
        className="modal-in outline-none bg-card border border-border rounded-2xl p-6 w-full max-w-xl max-h-[85vh] overflow-y-auto shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-base font-bold text-foreground">{tx.codesTitle}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Damage Codes</p>
                </div>
                <button type="button" aria-label={closeLabel} onClick={() => setShowCodes(false)} className="p-1 rounded hover:bg-muted/50 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {Object.entries(TMS_DATA.codes).map(([code, desc]) => {
                  const on = code === hiCode;
                  return (
                    <div key={code} className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${on ? "border-destructive bg-destructive/10" : "border-border/50 bg-muted/20"}`}>
                      <span className={`font-mono font-black text-xs w-10 shrink-0 ${on ? "text-destructive" : "text-primary"}`}>{code}</span>
                      <span className="text-xs text-muted-foreground">{desc}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

      {/* 타이어 히스토리 모달 */}
        {hist && (
          <div
            className="overlay-in fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
            onClick={() => setHistoryOf(null)}
          >
            <div
              ref={histRef} role="dialog" aria-modal="true" aria-label={hist.serial} tabIndex={-1}
        className="modal-in outline-none bg-card border border-border rounded-2xl p-6 w-full max-w-3xl max-h-[85vh] overflow-y-auto shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-base font-bold font-mono break-all">{hist.serial}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {hist.ch ? `CH ${hist.ch} · ${hist.pos}` : tx.histNotInstall} · {tx.histTireHistory}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_STYLE[hist.status as LifeRecord["status"]] ?? ""}`}>
                    {tx.statusName[hist.status as LifeRecord["status"]] ?? hist.status}
                  </span>
                  <button type="button" aria-label={closeLabel} onClick={() => setHistoryOf(null)} className="p-1 rounded hover:bg-muted/50 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* 이력 요약 */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm mb-4">
                <HRow label={tx.hInstall} value={hist.installDate} />
                <HRow label={tx.hMount} value={hist.mountDate} sub={tx.hMountSub} />
                <HRow label={tx.hRemove} value={hist.removeDate} />
                <HRow label={tx.hScrap} value={hist.scrapDate} danger />
                <HRow label={tx.hDamage} value={hist.damage ? codeName(hist.damage) : null} danger />
                <HRow label={tx.hHmReset} value={hist.hmReset ? tx.hHmResetYes : tx.hHmResetNo} danger={hist.hmReset} />
                <HRow label={tx.hKmHr} value={`${fmtInt(hist.km)} km / ${fmtInt(hist.hr)} hr`} mono />
                <HRow label={tx.hCpk} value={(() => { const k = tireCostOf(hist.serial); return k?.cpk != null ? fmtCpk(k.cpk, k.currency) : EMPTY; })()} mono />
                <HRow label={tx.hExpKmHm} value={`${fmtInt(hist.expectedKm)} km / ${fmtInt(hist.expectedHm)} hr`} mono />
                <HRow
                  label={tx.hTread}
                  value={hist.latestTread != null
                    ? `${fmtTread(hist.latestTread, false)} mm (${tx.hTreadMin})`
                    : null}
                  mono
                />
                {/* 4점은 두 칸을 다 쓴다 — 값 넷에 평균까지 한 줄에 넣어야 비교가 된다.
                    최소값이 어느 점에서 나왔는지 굵게 표시해 위의 숫자와 이어 붙인다. */}
                <div className="col-span-2">
                  <span className="text-[11px] text-muted-foreground font-semibold">{tx.hWidths}</span>
                  {latestW ? (
                    <p className="font-mono text-xs mt-0.5">
                      {WIDTH_KEYS.map((w) => {
                        const v = latestW[w.k];
                        const isMin = v != null && hist.latestTread != null && v === hist.latestTread;
                        return (
                          <span key={w.k} className="inline-block mr-3">
                            <span className="text-[10px] text-muted-foreground mr-1">{w.label}</span>
                            <span className={isMin ? "font-bold text-foreground" : ""}>
                              {v != null ? fmtTread(v, false) : EMPTY}
                            </span>
                          </span>
                        );
                      })}
                      {hist.latestTreadAvg != null && (
                        <span className="text-muted-foreground">
                          · {tx.hTreadAvg} {fmtTread(hist.latestTreadAvg, false)} mm
                        </span>
                      )}
                      <span className="ml-2"><IrregularWearBadge widths={latestW} /></span>
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground/60 mt-0.5">{tx.hNoWidths}</p>
                  )}
                </div>
              </div>

              {/* 비용 (§B-1) */}
              <TireCostSection serial={hist.serial} onSaved={onDataChanged} />

              {/* 장착 이력 (위치·차량 변경) */}
              <div className="mb-4">
                <p className="text-xs font-bold text-primary mb-2">{tx.moveHist} ({moves.length})</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse font-mono">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground">
                        <th className="px-2 py-1 text-left font-semibold">{tx.mDate}</th>
                        <th className="px-2 py-1 text-left font-semibold">{tx.mVehicle}</th>
                        <th className="px-2 py-1 text-left font-semibold">{tx.mPos}</th>
                        <th className="px-2 py-1 text-left font-semibold">{tx.mKind}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {moves.map((m, i) => {
                        const current = hist.ch === m.ch && hist.pos === m.pos;
                        return (
                          <tr key={i} className={`border-b border-border/30 ${current ? "bg-primary/5" : ""}`}>
                            <td className="px-2 py-1">{m.date ?? EMPTY}</td>
                            <td className="px-2 py-1 font-bold text-primary">CH {m.ch}</td>
                            <td className="px-2 py-1">{m.pos}</td>
                            <td className="px-2 py-1">
                              <span className="font-sans text-muted-foreground">{m.kind === "install" ? tx.mInstall : tx.mMount}</span>
                              {current && <span className="font-sans ml-1 text-[10px] text-level-ok font-bold">· {tx.mCurrent}</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {moves.length <= 1 && <p className="text-[11px] text-muted-foreground mt-1">{tx.moveNone}</p>}
              </div>

              {/* 측정 회차 이력 */}
              <div>
                <p className="text-xs font-bold text-primary mb-2">{tx.measHist} ({hist.rounds.length}{tx.sessions})</p>
                {hist.rounds.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{tx.noMeasData}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse font-mono">
                      <thead>
                        <tr className="text-muted-foreground/70">
                          <th />
                          <th colSpan={7} className="px-2 pt-1 text-center text-[10px] font-semibold border-b border-border/40">{tx.colDepth}</th>
                          <th colSpan={2} />
                        </tr>
                        <tr className="border-b border-border text-muted-foreground">
                          <th className="px-2 py-1 text-left font-semibold">{tx.colInspect}</th>
                          {/* 폭 4점을 먼저 보이고, 그 뒤에 거기서 나온 최소·평균을 둔다.
                              읽는 순서가 계산 순서와 같아야 표를 설명할 필요가 없다. */}
                          {WIDTH_KEYS.map((w) => (
                            <th key={w.k} className="px-2 py-1 text-right font-semibold">{w.label}</th>
                          ))}
                          <th className="px-2 py-1 text-right font-semibold">{tx.hTreadMin}</th>
                          <th className="px-2 py-1 text-right font-semibold">{tx.hTreadAvg}</th>
                          <th className="px-2 py-1 text-left font-semibold">{tx.colIrregular}</th>
                          <th className="px-2 py-1 text-right font-semibold">KM</th>
                          <th className="px-2 py-1 text-right font-semibold">HM</th>
                        </tr>
                      </thead>
                      <tbody>
                        {hist.rounds.map((r, i) => (
                          <tr key={i} className="border-b border-border/30">
                            <td className="px-2 py-1">{r.date}</td>
                            {WIDTH_KEYS.map((w) => {
                              const v = r.widths ? r.widths[w.k] : null;
                              // 최소값이 나온 지점을 굵게. 어느 그루브가 판정을 쥐는지가 이 표의 요점이다.
                              const isMin = v != null && r.tread != null && v === r.tread;
                              return (
                                <td key={w.k} className={`px-2 py-1 text-right ${isMin ? "font-bold text-foreground" : "text-muted-foreground"}`}>
                                  {v != null ? fmtTread(v, false) : EMPTY}
                                </td>
                              );
                            })}
                            <td className={`px-2 py-1 text-right font-bold ${r.tread != null ? TREAD_CLS[treadLevel(r.tread)] : ""}`}>
                              {r.tread != null ? fmtTread(r.tread, false) : EMPTY}
                            </td>
                            <td className="px-2 py-1 text-right text-muted-foreground">{r.treadAvg != null ? fmtTread(r.treadAvg, false) : EMPTY}</td>
                            <td className="px-2 py-1"><IrregularWearBadge widths={r.widths} compact /></td>
                            <td className="px-2 py-1 text-right">{fmtInt(r.km)}</td>
                            <td className="px-2 py-1 text-right">{fmtInt(r.hm)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="text-[10px] text-muted-foreground/70 mt-1.5 leading-relaxed">{tx.modalFoot}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
    </div>
  );
}

function HRow({ label, value, mono, danger, sub }: { label: string; value: string | null | undefined; mono?: boolean; danger?: boolean; sub?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-muted-foreground font-semibold">{label}</span>
      <span className={`text-xs ${mono ? "font-mono" : ""} ${danger && value && value !== EMPTY ? "text-level-danger font-bold" : "text-foreground"}`}>
        {value || EMPTY}{sub && value && value !== EMPTY ? <span className="text-[10px] text-muted-foreground ml-1">{sub}</span> : null}
      </span>
    </div>
  );
}
