// @section: tire-detail-modal
// 타이어 상세 모달 — 차량 배치도(LayoutTab)와 동일한 형태.
// 포지션의 권장압·시리얼·최근 공기압/트레드 + 트레드·공기압 추이 미니차트.
// LayoutTab · InspectionTab(점검 이력 배치도) 공용. 등장 애니메이션은 CSS(.overlay-in/.modal-in).
import { TMS_DATA, HEAD_MAP, recPsi, NEW_TREAD, treadThresholds } from "@/data/tmsData";
import { headPosData, statusOf, codeName, unitByCh, currentSegmentPairs } from "@/data/tmsUtils";
import type { TireStatus } from "@/data/tmsUtils";
import { EMPTY } from "@/lib/format";
import { X } from "lucide-react";
import { DICT, useLang } from "@/i18n";
import { useDialog } from "@/lib/useDialog";
import SerialChain from "./SerialChain";
import PosLatestRows from "./PosLatestRows";
import { awaitingLabel } from "./posLatestText";

const TX = {
  ko: {
    recPress: "권장 공기압", serial: "시리얼", serialHint: "클릭 → 수명 DB 보기",
    latestPress: "최근 공기압", latestTread: "최근 트레드", newPrefix: "신품 ",
    remark: "비고", scrap: "폐기", lifetime: "수명 ", lifetimeHours: "시간",
    treadTrend: "트레드 추이 (mm)", pressTrend: "공기압 추이 (psi)", noData: "데이터 없음",
    statusOk: "정상", statusWarn: "주의", statusOrder: "발주", statusDanger: "즉시 교체", statusNone: "시험 외",
  },
  id: {
    recPress: "Tekanan rekomendasi", serial: "Serial", serialHint: "Klik → lihat DB umur",
    latestPress: "Tekanan terkini", latestTread: "Tapak terkini", newPrefix: "baru ",
    remark: "Catatan", scrap: "Afkir", lifetime: "umur ", lifetimeHours: "jam",
    treadTrend: "Tren tapak (mm)", pressTrend: "Tren tekanan (psi)", noData: "Tidak ada data",
    statusOk: "Normal", statusWarn: "Perhatian", statusOrder: "Pesan ban", statusDanger: "Ganti segera", statusNone: "Non-uji",
  },
  en: {
    recPress: "Recommended pressure", serial: "Serial", serialHint: "Click → view lifetime DB",
    latestPress: "Latest pressure", latestTread: "Latest tread", newPrefix: "new ",
    remark: "Remark", scrap: "Scrap", lifetime: "lifetime ", lifetimeHours: "hours",
    treadTrend: "Tread trend (mm)", pressTrend: "Pressure trend (psi)", noData: "No data",
    statusOk: "Normal", statusWarn: "Caution", statusOrder: "Order tire", statusDanger: "Replace now", statusNone: "Not tested",
  },
} as const;

// 4단계 신호등 — 녹색 ≥10mm / 황색 5~10mm / 주황 3~5mm(발주) / 적색 <3mm
const STATUS_STYLE: Record<TireStatus, string> = {
  ok: "border-level-ok bg-level-ok/10 text-level-ok",
  warn: "border-level-warn bg-level-warn/10 text-level-warn",
  order: "border-level-order bg-level-order/10 text-level-order",
  danger: "border-level-danger bg-level-danger/10 text-level-danger",
  none: "border-border/40 bg-muted/20 text-muted-foreground opacity-40 border-dashed cursor-default",
};
const STATUS_LABEL: Record<keyof typeof TX, Record<TireStatus, string>> = {
  ko: { ok: TX.ko.statusOk, warn: TX.ko.statusWarn, order: TX.ko.statusOrder, danger: TX.ko.statusDanger, none: TX.ko.statusNone },
  id: { ok: TX.id.statusOk, warn: TX.id.statusWarn, order: TX.id.statusOrder, danger: TX.id.statusDanger, none: TX.id.statusNone },
  en: { ok: TX.en.statusOk, warn: TX.en.statusWarn, order: TX.en.statusOrder, danger: TX.en.statusDanger, none: TX.en.statusNone },
};

export default function TireDetailModal({ ch, pos, onClose, onSerialClick }: {
  ch: string;
  pos: number;
  onClose: () => void;
  onSerialClick?: (serial: string) => void;
}) {
  const { lang } = useLang();
  const tx = TX[lang];
  const u = unitByCh(ch);
  const d = headPosData(u, pos);
  const st = statusOf(d, pos);

  // Esc · 포커스 (COM-03)
  const dialogRef = useDialog(true, onClose);
  const closeLabel = DICT[lang]["common.close"];

  return (
    <div
      className="overlay-in fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      onClick={onClose}
    >
      <div
        ref={dialogRef} role="dialog" aria-modal="true" aria-label={`CH ${ch} · ${HEAD_MAP[pos]}`} tabIndex={-1}
        className="modal-in outline-none bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold font-mono">#{pos} · {HEAD_MAP[pos]}</h3>
            <p className="text-xs text-muted-foreground">CH {ch} · {TMS_DATA.tire.brand} {TMS_DATA.tire.size}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold px-2 py-1 rounded-full border ${STATUS_STYLE[st]}`}>
              {st === "none" && d?.awaiting ? awaitingLabel(lang) : STATUS_LABEL[lang][st]}
            </span>
            <button type="button" aria-label={closeLabel} onClick={onClose} className="p-1 rounded hover:bg-muted/50 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {d && (
          <div className="space-y-2 text-sm">
            <Row label={tx.recPress} value={`${recPsi(pos)} psi`} />
            <div className="flex gap-2">
              <span className="w-28 shrink-0 text-xs text-muted-foreground font-semibold">{tx.serial}</span>
              <SerialChain
                chain={d.chain}
                fallbackSerial={d.serial}
                onSerialClick={onSerialClick}
                hint={tx.serialHint}
              />
            </div>
            <PosLatestRows d={d} />
            {d.remark && <Row label={tx.remark} value={d.remark} danger />}
            {(() => {
              const scrap = TMS_DATA.life.find((l) => l.serial === d.serial && l.status === "Scrap");
              return scrap ? <Row label={tx.scrap} value={`${scrap.scrap} · ${codeName(scrap.damage)} · ${tx.lifetime}${scrap.lifetime}${tx.lifetimeHours}`} danger /> : null;
            })()}

            <div className="mt-3">
              <p className="text-xs text-muted-foreground mb-1 font-semibold">{tx.treadTrend}</p>
              <MiniChart
                pairs={currentSegmentPairs(u, d.segments, "tread")}
                min={0} max={NEW_TREAD} danger={treadThresholds().order} warn={treadThresholds().caution} decimals={1}
              />
            </div>
            <div className="mt-2">
              <p className="text-xs text-muted-foreground mb-1 font-semibold">{tx.pressTrend}</p>
              <MiniChart
                pairs={currentSegmentPairs(u, d.segments, "press")}
                min={60} max={145} danger={null} warn={null} decimals={0}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, mono, danger }: { label: string; value: string | null | undefined; mono?: boolean; danger?: boolean }) {
  return (
    <div className="flex gap-2">
      <span className="w-28 shrink-0 text-xs text-muted-foreground font-semibold">{label}</span>
      <span className={`text-xs ${mono ? "font-mono" : ""} ${danger ? "text-destructive font-bold" : ""}`}>{value ?? EMPTY}</span>
    </div>
  );
}

function MiniChart({ pairs, min, max, danger, warn, decimals }: {
  pairs: { d: string; v: number }[];
  min: number; max: number;
  danger: number | null; warn: number | null;
  decimals?: number;
}) {
  const { lang } = useLang();
  if (pairs.length < 1) return <p className="text-xs text-muted-foreground">{TX[lang].noData}</p>;
  const W = 340, H = 70, pad = 20;
  const xs = (i: number) => pairs.length <= 1 ? W / 2 : pad + (i * (W - 2 * pad)) / (pairs.length - 1);
  const ys = (v: number) => H - 14 - ((v - min) / (max - min)) * (H - 26);
  const path = pairs.map((p, i) => `${i ? "L" : "M"}${xs(i).toFixed(1)} ${ys(p.v).toFixed(1)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-xs" style={{ height: 70 }}>
      {danger != null && <line x1={pad} y1={ys(danger)} x2={W - pad} y2={ys(danger)} stroke="rgb(239,68,68)" strokeDasharray="4 3" strokeWidth={1} />}
      {warn != null && <line x1={pad} y1={ys(warn)} x2={W - pad} y2={ys(warn)} stroke="rgb(234,179,8)" strokeDasharray="4 3" strokeWidth={1} />}
      <path d={path} fill="none" stroke="hsl(45 90% 55%)" strokeWidth={2} strokeLinejoin="round" />
      {pairs.map((p, i) => (
        <g key={i}>
          <circle cx={xs(i)} cy={ys(p.v)} r={3} fill="hsl(45 90% 55%)" />
          <text x={xs(i)} y={ys(p.v) - 5} fontSize={8} textAnchor="middle" fill="currentColor" opacity={0.8}>{decimals != null ? p.v.toFixed(decimals) : p.v}</text>
          <text x={xs(i)} y={H - 2} fontSize={7} textAnchor="middle" fill="currentColor" opacity={0.5}>{p.d.slice(5)}</text>
        </g>
      ))}
    </svg>
  );
}
