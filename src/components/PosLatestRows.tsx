// @section: pos-latest-rows
// 포지션 상세의 «최근 공기압 / 최근 트레드» 두 줄 — LayoutTab 모달 · TireDetailModal 공용.
// 값은 현재 장착 타이어 구간에서만 나온다 (headPosData, R-1). 배지 3종 (R-2):
//   측정 대기   — 교체 뒤 아직 측정 회차가 없다
//   오래된 값   — stale_days 를 넘었다. 공기압은 판정·알림에서 빠진다
//   이상점 제외 — 4점 중 0 하나를 빼고 판정했다
import type { HeadPosData } from "@/data/tmsUtils";
import { NEW_TREAD, staleDays } from "@/data/tmsData";
import { EMPTY, fmtPressure, fmtTread } from "@/lib/format";
import { useLang } from "@/i18n";
import { POS_LATEST_TX as TX } from "./posLatestText";



function Badge({ text, title }: { text: string; title: string }) {
  return (
    <span title={title} className="ml-1.5 inline-block rounded-full border border-border bg-muted px-1.5 py-px text-[10px] font-semibold text-muted-foreground">
      {text}
    </span>
  );
}

export default function PosLatestRows({ d }: { d: HeadPosData }) {
  const { lang } = useLang();
  const tx = TX[lang];
  const n = String(staleDays());
  const label = "w-28 shrink-0 text-xs text-muted-foreground font-semibold";

  if (d.awaiting) {
    return (
      <div className="flex gap-2">
        <span className={label}>{tx.latestTread}</span>
        <span className="text-xs">
          {EMPTY}
          <Badge text={tx.awaiting} title={tx.awaitingHint} />
        </span>
      </div>
    );
  }

  return (
    <>
      <div className="flex gap-2">
        <span className={label}>{tx.latestPress}</span>
        <span className="text-xs font-mono">
          {d.latestPress != null ? `${fmtPressure(d.latestPress)} (${d.latestPressDate})` : EMPTY}
          {d.latestPress != null && d.pressStale && <Badge text={tx.stale} title={tx.staleHint.replace("{n}", n)} />}
        </span>
      </div>
      <div className="flex gap-2">
        <span className={label}>{tx.latestTread}</span>
        <span className="text-xs font-mono">
          {d.latestTread != null
            ? `${fmtTread(d.latestTread, false)} mm (${d.latestTreadDate}) · ${tx.newPrefix}${NEW_TREAD}mm`
            : EMPTY}
          {d.latestTreadOutlier && <Badge text={tx.outlier} title={tx.outlierHint} />}
          {d.latestTread != null && d.treadStale && <Badge text={tx.stale} title={tx.staleTreadHint.replace("{n}", n)} />}
        </span>
      </div>
    </>
  );
}
