// @section: tire-detail-card
// 시리얼 상세 카드 — v_tire_detail 단건 조회.
// 수명 DB(lifetimes)에 행이 없어도 inspections·replacements 로 채워진 행이 나오므로,
// 미등록 시리얼을 클릭해도 빈 화면이 되지 않는다 (지시서 항목 5).
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { getTireDetail, type TireDetail } from "@/api/tires";
import { fmtInt } from "@/lib/format";
import { codeName, fmtTread } from "@/data/tmsUtils";
import { useLang } from "@/i18n";

const DASH = "—";

const TX = {
  ko: {
    title: "타이어 상세",
    loading: "불러오는 중…",
    notFound: "이 시리얼의 기록이 없습니다.",
    unregistered: "수명 DB 미등록 타이어",
    unregisteredHint: "점검 이력에서 가져온 데이터입니다. 최초 장착 정보를 보완해 주십시오.",
    serial: "시리얼",
    no: "No",
    install: "최초 장착일",
    status: "상태",
    lifetimeDays: "수명(일)",
    damage: "손상 코드",
    note: "비고",
    current: "현재 장착",
    mountedAt: "장착일",
    inspection: "점검 이력",
    inspectionRange: "점검 기간",
    inspectionCount: "점검 회차",
    lastTread: "최근 트레드",
    lastPressure: "최근 공기압",
    days: "일",
    rounds: "회",
    notMounted: "장착 위치 없음",
  },
  id: {
    title: "Detail ban",
    loading: "Memuat…",
    notFound: "Tidak ada catatan untuk serial ini.",
    unregistered: "Belum terdaftar di DB umur ban",
    unregisteredHint:
      "Data diambil dari riwayat pemeriksaan. Mohon lengkapi data pemasangan awal.",
    serial: "Serial",
    no: "No",
    install: "Tgl pasang awal",
    status: "Status",
    lifetimeDays: "Umur (hari)",
    damage: "Kode kerusakan",
    note: "Catatan",
    current: "Terpasang saat ini",
    mountedAt: "Tgl pasang",
    inspection: "Riwayat pemeriksaan",
    inspectionRange: "Periode pemeriksaan",
    inspectionCount: "Jumlah pemeriksaan",
    lastTread: "Tapak terkini",
    lastPressure: "Tekanan terkini",
    days: "hari",
    rounds: "kali",
    notMounted: "Tidak terpasang",
  },
  en: {
    title: "Tire detail",
    loading: "Loading…",
    notFound: "No record for this serial.",
    unregistered: "Not registered in lifetime DB",
    unregisteredHint:
      "Data taken from inspection history. Please complete the initial install record.",
    serial: "Serial",
    no: "No",
    install: "First install date",
    status: "Status",
    lifetimeDays: "Lifetime (days)",
    damage: "Damage code",
    note: "Remark",
    current: "Currently mounted",
    mountedAt: "Mounted on",
    inspection: "Inspection history",
    inspectionRange: "Inspection period",
    inspectionCount: "Inspection rounds",
    lastTread: "Latest tread",
    lastPressure: "Latest pressure",
    days: "days",
    rounds: "rounds",
    notMounted: "Not mounted",
  },
} as const;

export default function TireDetailCard({ serial }: { serial: string }) {
  const { lang } = useLang();
  const tx = TX[lang];

  const { data, isLoading } = useQuery<TireDetail | null>({
    queryKey: ["tire-detail", serial],
    queryFn: () => getTireDetail(serial),
    enabled: !!serial,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="text-xs text-muted-foreground">{tx.loading}</p>
      </div>
    );
  }

  // 뷰가 어느 소스에서도 이 시리얼을 못 찾은 경우 — 그래도 빈 화면 대신 문구를 보인다.
  if (!data) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-bold text-primary uppercase tracking-widest">{tx.title}</span>
          <span className="font-mono text-xs">{serial}</span>
        </div>
        <p className="text-xs text-muted-foreground">{tx.notFound}</p>
      </div>
    );
  }

  const reg = data.is_registered;
  const mounted = data.current_ch
    ? `CH ${data.current_ch} · ${data.current_pos ?? DASH}`
    : tx.notMounted;
  const range =
    data.first_inspection || data.last_inspection
      ? `${data.first_inspection ?? DASH} ~ ${data.last_inspection ?? DASH}`
      : DASH;

  return (
    <div
      className={`rounded-xl border bg-card p-5 ${
        reg ? "border-border" : "border-orange-500/60"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-xs font-bold text-primary uppercase tracking-widest">{tx.title}</span>
        <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded-full">{data.serial}</span>
        {!reg && (
          <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full border border-orange-500 bg-orange-50 text-orange-700">
            <AlertTriangle className="w-3 h-3" />
            {tx.unregistered}
          </span>
        )}
      </div>

      <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {/* 수명 DB 등록 정보 — 미등록이면 전부 — 로 비운다 */}
        <Row label={tx.no} value={reg ? fmtInt(data.lifetime_no) : DASH} mono />
        <Row label={tx.install} value={reg ? (data.install_date ?? DASH) : DASH} mono />
        <Row label={tx.status} value={reg ? (data.status ?? DASH) : DASH} />
        <Row
          label={tx.lifetimeDays}
          value={reg && data.lifetime_days != null ? `${fmtInt(data.lifetime_days)} ${tx.days}` : DASH}
          mono
        />
        {reg && data.damage_code && data.damage_code !== "-" && (
          <Row label={tx.damage} value={codeName(data.damage_code)} />
        )}
        {reg && data.note && <Row label={tx.note} value={data.note} />}

        {/* 현재 장착 위치 — 등록 여부와 무관하게 v_current_tire 에서 온다 */}
        <Row label={tx.current} value={mounted} mono />
        <Row label={tx.mountedAt} value={data.current_mounted_at ?? DASH} mono />

        {/* 점검 이력 — 미등록 타이어의 대체 표시원 */}
        <Row label={tx.inspectionRange} value={range} mono />
        <Row
          label={tx.inspectionCount}
          value={data.inspection_count != null ? `${fmtInt(data.inspection_count)} ${tx.rounds}` : DASH}
          mono
        />
        <Row
          label={tx.lastTread}
          value={data.last_tread != null ? `${fmtTread(data.last_tread)} mm` : DASH}
          mono
        />
        <Row
          label={tx.lastPressure}
          value={data.last_pressure != null ? `${fmtInt(data.last_pressure)} psi` : DASH}
          mono
        />
      </div>

      {!reg && (
        <p className="mt-3 text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
          {tx.unregisteredHint}
        </p>
      )}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-2">
      <span className="w-32 shrink-0 text-xs text-muted-foreground font-semibold">{label}</span>
      <span className={`text-xs ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}
