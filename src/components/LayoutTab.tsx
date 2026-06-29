// @section: layout-tab
import { useState } from "react";
import { TMS_DATA, HEAD_MAP, recPsi, NEW_TREAD } from "@/data/tmsData";
import { headPosData, statusOf, codeName, unitByCh, fmtTread } from "@/data/tmsUtils";
import type { TireStatus } from "@/data/tmsUtils";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useLang } from "@/i18n";

const TX = {
  ko: {
    unitCh: "차량(CH):",
    roadTrainImgAlt: "Road Train 차량",
    layoutTitle: "Road Train 차량 배치도",
    direction: "← 진행 방향",
    primeMover: "프라임무버",
    trailer1: "트레일러 1",
    dolly: "돌리",
    trailer2: "트레일러 2",
    statusOk: "정상",
    statusWarn: "주의",
    statusDanger: "교체권장",
    statusNone: "시험 외",
    legendNone: "시험 외 (12.00R24)",
    footnoteA: "Head(파랑) 10본 = TECHKING ETCrane 385/95R24(14.00R24), Vessel·Dolly(빨강)는 12.00R24으로 ",
    footnoteB: "시험 미포함",
    recPress: "권장 공기압",
    serial: "시리얼",
    serialHint: "클릭 → 수명 DB 보기",
    latestPress: "최근 공기압",
    latestTread: "최근 트레드",
    newPrefix: "신품 ",
    remark: "비고",
    scrap: "폐기",
    lifetime: "수명 ",
    lifetimeHours: "시간",
    treadTrend: "트레드 추이 (mm)",
    pressTrend: "공기압 추이 (psi)",
    noData: "데이터 없음",
  },
  id: {
    unitCh: "Unit(CH):",
    roadTrainImgAlt: "Unit Road Train",
    layoutTitle: "Tata Letak Road Train",
    direction: "← Arah jalan",
    primeMover: "Prime Mover",
    trailer1: "Trailer 1",
    dolly: "Dolly",
    trailer2: "Trailer 2",
    statusOk: "Normal",
    statusWarn: "Perhatian",
    statusDanger: "Rekomendasi ganti",
    statusNone: "Non-uji",
    legendNone: "Non-uji (12.00R24)",
    footnoteA: "Head(biru) 10 ban = TECHKING ETCrane 385/95R24(14.00R24), Vessel·Dolly(merah) 12.00R24 ",
    footnoteB: "Tidak termasuk uji",
    recPress: "Tekanan rekomendasi",
    serial: "Serial",
    serialHint: "Klik → lihat DB umur",
    latestPress: "Tekanan terkini",
    latestTread: "Tapak terkini",
    newPrefix: "baru ",
    remark: "Catatan",
    scrap: "Afkir",
    lifetime: "umur ",
    lifetimeHours: "jam",
    treadTrend: "Tren tapak (mm)",
    pressTrend: "Tren tekanan (psi)",
    noData: "Tidak ada data",
  },
} as const;

const STATUS_STYLE: Record<TireStatus, string> = {
  ok: "border-green-600 bg-green-50 text-green-700",
  warn: "border-yellow-500 bg-yellow-50 text-yellow-700",
  danger: "border-red-500 bg-red-50 text-red-700",
  none: "border-border/40 bg-muted/20 text-muted-foreground opacity-40 border-dashed cursor-default",
};
const STATUS_LABEL: Record<keyof typeof TX, Record<TireStatus, string>> = {
  ko: { ok: TX.ko.statusOk, warn: TX.ko.statusWarn, danger: TX.ko.statusDanger, none: TX.ko.statusNone },
  id: { ok: TX.id.statusOk, warn: TX.id.statusWarn, danger: TX.id.statusDanger, none: TX.id.statusNone },
};

interface ModalInfo {
  ch: string;
  pos: number;
}

export default function LayoutTab({ onSerialClick, focusCh }: { onSerialClick?: (serial: string) => void; focusCh?: string | null }) {
  const { lang } = useLang();
  const tx = TX[lang];
  const initCh = focusCh && TMS_DATA.units.some((u) => u.ch === focusCh) ? focusCh : TMS_DATA.units[0].ch;
  const [selCh, setSelCh] = useState(initCh);
  const [modal, setModal] = useState<ModalInfo | null>(null);

  const u = unitByCh(selCh);

  const LAYOUT = [
    { name: "Head", sub: tx.primeMover, cls: "border-primary", labelCls: "text-primary", size: TMS_DATA.tire.size, isHead: true,
      axles: [
        { label: "①", steer: true, top: [1], bot: [2] },
        { label: "②", top: [3, 4], bot: [6, 5] },
        { label: "③", top: [7, 8], bot: [10, 9] },
      ],
    },
    { name: "Trailer 1", sub: tx.trailer1, cls: "border-red-600", labelCls: "text-red-400", size: "12.00R24", isHead: false,
      axles: [
        { label: "A", top: [11,12], bot: [13,14] },
        { label: "B", top: [15,16], bot: [17,18] },
        { label: "C", top: [19,20], bot: [21,22] },
      ],
    },
    { name: "Dolly", sub: tx.dolly, cls: "border-red-600", labelCls: "text-red-400", size: "12.00R24", isHead: false,
      axles: [
        { label: "A", top: [23,24], bot: [25,26] },
        { label: "B", top: [27,28], bot: [29,30] },
        { label: "C", top: [31,32], bot: [33,34] },
      ],
    },
    { name: "Trailer 2", sub: tx.trailer2, cls: "border-red-600", labelCls: "text-red-400", size: "12.00R24", isHead: false,
      axles: [
        { label: "A", top: [35,36], bot: [37,38] },
        { label: "B", top: [39,40], bot: [41,42] },
        { label: "C", top: [43,44], bot: [45,46] },
      ],
    },
  ];

  const modalData = modal
    ? { u: unitByCh(modal.ch), pos: modal.pos, d: headPosData(unitByCh(modal.ch), modal.pos), st: statusOf(headPosData(unitByCh(modal.ch), modal.pos), modal.pos) }
    : null;

  return (
    <div className="space-y-4">
      {/* 차량 선택 */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground font-semibold mr-1">{tx.unitCh}</span>
        {TMS_DATA.units.map((unit) => (
          <button
            key={unit.ch}
            onClick={() => setSelCh(unit.ch)}
            className={`px-4 py-1.5 rounded-lg text-sm font-mono font-bold border transition-all ${
              selCh === unit.ch
                ? "bg-primary text-primary-foreground border-primary shadow-lg"
                : "bg-muted/30 border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
            }`}
          >
            CH {unit.ch}
          </button>
        ))}
      </div>

      {/* Road Train 시각화 */}
      <div className="rounded-xl border border-border bg-card p-4 relative overflow-hidden">
        {/* 실제 Road Train 차량(CH 834) 흐릿한 배경 */}
        <img
          src={`${import.meta.env.BASE_URL}roadtrain.jpg`}
          alt={tx.roadTrainImgAlt}
          aria-hidden="true"
          className="pointer-events-none select-none absolute inset-0 w-full h-full object-cover opacity-[0.25]"
        />
        <div className="relative">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-bold text-primary uppercase tracking-widest">{tx.layoutTitle}</span>
          <span className="text-xs text-muted-foreground">{tx.direction}</span>
        </div>
        <div className="overflow-x-auto pb-2">
          <div className="flex items-stretch gap-1 w-max mx-auto px-2 py-2" style={{ zoom: 1.5 }}>
            {LAYOUT.map((grp) => (
              <div key={grp.name} className={`border-2 ${grp.cls} rounded-xl px-3 pt-5 pb-3 relative mx-1 flex flex-col`}>
                <span className={`absolute -top-3 left-3 bg-background px-2 text-xs font-black ${grp.labelCls}`}>
                  {grp.name}
                </span>
                {/* 축 레이블(①②③ / A·B·C)이 그룹 간 가로 정렬되도록 세로 중앙 밴드에 배치 */}
                <div className="flex-1 flex items-center justify-center">
                <div className="flex gap-3 items-center">
                  {grp.axles.map((axle, ai) => (
                    <div key={ai} className="flex flex-col items-center gap-1">
                      {/* 상단 타이어 */}
                      <div className="flex flex-col gap-1">
                        {axle.top.map((p) => (
                          <TireCell
                            key={p} pos={p} isHead={grp.isHead} u={u}
                            onClick={grp.isHead ? () => setModal({ ch: selCh, pos: p }) : undefined}
                          />
                        ))}
                      </div>
                      {/* 축 레이블 */}
                      {axle.label ? (
                        "①②③".includes(axle.label) ? (
                          <div className="flex items-center justify-center h-5 text-base font-bold text-muted-foreground leading-none">
                            {axle.label}
                          </div>
                        ) : (
                          <div className="w-5 h-5 rounded-full border border-border bg-muted/30 flex items-center justify-center text-[9px] font-bold text-muted-foreground">
                            {axle.label}
                          </div>
                        )
                      ) : <div className="h-2" />}
                      {/* 하단 타이어 */}
                      <div className="flex flex-col gap-1">
                        {axle.bot.map((p) => (
                          <TireCell
                            key={p} pos={p} isHead={grp.isHead} u={u}
                            onClick={grp.isHead ? () => setModal({ ch: selCh, pos: p }) : undefined}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                </div>
                <div className="mt-2 text-[9px] text-muted-foreground text-center">{grp.sub} · {grp.size}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 범례 */}
        <div className="flex flex-wrap gap-4 mt-3 text-xs">
          {[
            { cls: "bg-green-500/15 border-green-500", label: tx.statusOk },
            { cls: "bg-yellow-400/15 border-yellow-400", label: tx.statusWarn },
            { cls: "bg-red-500/15 border-red-500", label: tx.statusDanger },
            { cls: "bg-muted/20 border-border/50 border-dashed opacity-50", label: tx.legendNone },
          ].map((l) => (
            <span key={l.label} className="flex items-center gap-1.5">
              <span className={`w-4 h-5 rounded border-2 ${l.cls} inline-block`} />
              {l.label}
            </span>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {tx.footnoteA}{tx.footnoteB}.
        </p>
        </div>
      </div>

      {/* 모달 */}
      <AnimatePresence>
        {modal && modalData && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setModal(null)}
          >
            <motion.div
              className="bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl"
              initial={{ scale: 0.92, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, y: 20 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold font-mono">
                    #{modal.pos} · {HEAD_MAP[modal.pos]}
                  </h3>
                  <p className="text-xs text-muted-foreground">CH {modal.ch} · {TMS_DATA.tire.brand} {TMS_DATA.tire.size}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold px-2 py-1 rounded-full border ${STATUS_STYLE[modalData.st]}`}>
                    {STATUS_LABEL[lang][modalData.st]}
                  </span>
                  <button onClick={() => setModal(null)} className="p-1 rounded hover:bg-muted/50 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {modalData.d && (
                <div className="space-y-2 text-sm">
                  <Row label={tx.recPress} value={`${recPsi(modal.pos)} psi`} />
                  <div className="flex gap-2">
                    <span className="w-28 shrink-0 text-xs text-muted-foreground font-semibold">{tx.serial}</span>
                    <span className="text-xs font-mono">
                      <button className="text-primary hover:underline" onClick={() => onSerialClick?.(modalData.d!.serial)}>
                        {modalData.d.serial}
                      </button>
                      {modalData.d.serial2 && (
                        <>
                          {" → "}
                          <button className="text-primary hover:underline" onClick={() => onSerialClick?.(modalData.d!.serial2!)}>
                            {modalData.d.serial2}
                          </button>
                        </>
                      )}
                      <span className="block text-[10px] text-muted-foreground/70">{tx.serialHint}</span>
                    </span>
                  </div>
                  <Row label={tx.latestPress} value={modalData.d.latestPress != null ? `${Math.round(modalData.d.latestPress)} psi (${modalData.d.latestPressDate})` : "−"} mono />
                  <Row label={tx.latestTread} value={modalData.d.latestTread != null ? `${fmtTread(modalData.d.latestTread)} mm (${modalData.d.latestTreadDate}) · ${tx.newPrefix}${NEW_TREAD}mm` : "−"} mono />
                  {modalData.d.remark && <Row label={tx.remark} value={modalData.d.remark} danger />}
                  {(() => {
                    const scrap = TMS_DATA.life.find((l) => l.serial === modalData.d!.serial && l.status === "Scrap");
                    return scrap ? <Row label={tx.scrap} value={`${scrap.scrap} · ${codeName(scrap.damage)} · ${tx.lifetime}${scrap.lifetime}${tx.lifetimeHours}`} danger /> : null;
                  })()}

                  {/* 트레드 추이 미니차트 */}
                  <div className="mt-3">
                    <p className="text-xs text-muted-foreground mb-1 font-semibold">{tx.treadTrend}</p>
                    <MiniChart
                      pairs={modalData.u.dates
                        .map((d, i) => ({ d: d ?? "", v: modalData.d!.treadMin[i] ?? null }))
                        .filter((p) => p.d && p.v != null) as { d: string; v: number }[]}
                      min={0} max={NEW_TREAD} danger={5} warn={8} decimals={1}
                    />
                  </div>
                  <div className="mt-2">
                    <p className="text-xs text-muted-foreground mb-1 font-semibold">{tx.pressTrend}</p>
                    <MiniChart
                      pairs={modalData.u.dates
                        .map((d, i) => ({ d: d ?? "", v: typeof modalData.d!.press[i] === "number" ? (modalData.d!.press[i] as number) : null }))
                        .filter((p) => p.d && p.v != null) as { d: string; v: number }[]}
                      min={60} max={145} danger={null} warn={null} decimals={0}
                    />
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Row({ label, value, mono, danger }: { label: string; value: string | null | undefined; mono?: boolean; danger?: boolean }) {
  return (
    <div className="flex gap-2">
      <span className="w-28 shrink-0 text-xs text-muted-foreground font-semibold">{label}</span>
      <span className={`text-xs ${mono ? "font-mono" : ""} ${danger ? "text-destructive font-bold" : ""}`}>
        {value ?? "−"}
      </span>
    </div>
  );
}

function TireCell({ pos, isHead, u, onClick }: {
  pos: number; isHead: boolean;
  u: ReturnType<typeof unitByCh>;
  onClick?: () => void;
}) {
  if (!isHead) {
    return (
      <div className="w-8 h-5 rounded border border-dashed border-border/60 bg-background/15 flex items-center justify-center text-[9px] font-semibold text-muted-foreground cursor-default">
        {pos}
      </div>
    );
  }
  const d = headPosData(u, pos);
  const st = statusOf(d, pos);
  const label = HEAD_MAP[pos] ?? String(pos);
  const parts = label.split(" ");
  return (
    <button
      onClick={onClick}
      title={`${label} · ${d?.latestPress ?? "-"}psi / ${d?.latestTread ?? "-"}mm`}
      className={`w-10 h-6 rounded border-2 flex flex-col items-center justify-center transition-all hover:scale-105 hover:shadow-lg cursor-pointer ${STATUS_STYLE[st]}`}
    >
      <span className="text-[10px] font-black leading-none">{parts[0]}</span>
      {parts[1] && <span className="text-[8px] font-bold leading-none opacity-80">{parts.slice(1).join(" ")}</span>}
    </button>
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
      {danger != null && (
        <line x1={pad} y1={ys(danger)} x2={W - pad} y2={ys(danger)} stroke="rgb(239,68,68)" strokeDasharray="4 3" strokeWidth={1} />
      )}
      {warn != null && (
        <line x1={pad} y1={ys(warn)} x2={W - pad} y2={ys(warn)} stroke="rgb(234,179,8)" strokeDasharray="4 3" strokeWidth={1} />
      )}
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
