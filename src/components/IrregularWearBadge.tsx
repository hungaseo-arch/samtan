// @section: irregular-wear
// 4점 편마모 배지 (지시서 2026-10-16 §A-7) — 배치도 모달·측정 이력 표가 같은 문구·색을 쓰도록 한 곳에 둔다.
import { useLang } from "@/i18n";
import { fmtTread } from "@/lib/format";
import { irregularOfWidths, IRREGULAR_WARN_MM, IRREGULAR_DANGER_MM, SHOULDER_GAP_MM } from "@/lib/irregularWear";
import type { IrregularLevel } from "@/lib/irregularWear";
import type { TreadWidths } from "@/data/tmsData";

const TX = {
  ko: {
    shoulderOuter: "숄더 마모(외측)",
    shoulderInner: "숄더 마모(내측)",
    title: `4점 최대−최소 ${IRREGULAR_WARN_MM}mm 이상 주의, ${IRREGULAR_DANGER_MM}mm 이상 위험. 외측(좌·중1) 평균이 내측(중2·우) 평균보다 ${SHOULDER_GAP_MM}mm 넘게 낮으면 외측 숄더 마모`,
  },
  id: {
    shoulderOuter: "Aus bahu (luar)",
    shoulderInner: "Aus bahu (dalam)",
    title: `Selisih maks−min 4 titik ≥ ${IRREGULAR_WARN_MM}mm waspada, ≥ ${IRREGULAR_DANGER_MM}mm bahaya. Rerata luar (Kiri·Tgh 1) lebih rendah > ${SHOULDER_GAP_MM}mm dari rerata dalam (Tgh 2·Kanan) = aus bahu luar`,
  },
  en: {
    shoulderOuter: "Shoulder wear (outer)",
    shoulderInner: "Shoulder wear (inner)",
    title: `4-point max−min ≥ ${IRREGULAR_WARN_MM}mm caution, ≥ ${IRREGULAR_DANGER_MM}mm danger. Outer pair (L·C1) average more than ${SHOULDER_GAP_MM}mm below inner pair (C2·R) = outer shoulder wear`,
  },
};

const LEVEL_CLS: Record<IrregularLevel, string> = {
  ok: "text-muted-foreground",
  warn: "text-level-warn bg-level-warn/10 border-level-warn/40",
  danger: "text-level-danger bg-level-danger/10 border-level-danger/40",
};

/**
 * Δ(최대−최소) 와 숄더 태그. 4점이 다 없으면 아무것도 그리지 않는다 — 4점 이전 회차는 기존 화면 그대로.
 * compact: 표 셀용(Δ값만 색칠, 태그는 짧게).
 */
export default function IrregularWearBadge({ widths, compact }: { widths: TreadWidths | null | undefined; compact?: boolean }) {
  const { lang } = useLang();
  const tx = TX[lang];
  const iw = irregularOfWidths(widths);
  if (!iw) return null;
  const tag = iw.shoulder === "outer" ? tx.shoulderOuter : iw.shoulder === "inner" ? tx.shoulderInner : null;
  const boxed = iw.level !== "ok";
  return (
    <span title={tx.title} className="inline-flex items-center gap-1 whitespace-nowrap">
      <span className={`font-mono ${boxed ? "font-bold px-1 rounded border" : ""} ${LEVEL_CLS[iw.level]}`}>
        Δ{fmtTread(iw.range, false)}
      </span>
      {tag && (
        <span className={`${compact ? "text-[10px]" : "text-[11px]"} font-semibold px-1 rounded border ${LEVEL_CLS[iw.level === "ok" ? "warn" : iw.level]}`}>
          {tag}
        </span>
      )}
    </span>
  );
}
