// @section: tire-schematic
// 재사용 배치도(Head 10본) — 포지션별 공기압/트레드/시리얼을 신호등 색상으로 렌더.
// LayoutTab · InspectionTab(점검 이력) 공용.
import { HEAD_MAP } from "@/data/tmsData";
import { statusFromValues, fmtTread } from "@/data/tmsUtils";
import type { TireStatus } from "@/data/tmsUtils";

export interface SchematicCell {
  pressure: number | null;
  tread: number | null;
  serial?: string | null;
}

// 상태 → Tailwind 색상 (LayoutTab의 STATUS_STYLE과 동일)
const STATUS_STYLE: Record<TireStatus, string> = {
  ok: "border-green-600 bg-green-50 text-green-700",
  warn: "border-yellow-500 bg-yellow-50 text-yellow-700",
  danger: "border-red-500 bg-red-50 text-red-700",
  none: "border-border/40 bg-muted/20 text-muted-foreground opacity-40 border-dashed cursor-default",
};

// Head 축 배열 (LayoutTab.LAYOUT[0].axles 와 동일 물리 배치)
const AXLES: { label: string; top: number[]; bot: number[] }[] = [
  { label: "①", top: [1], bot: [2] },
  { label: "②", top: [3, 4], bot: [6, 5] },
  { label: "③", top: [7, 8], bot: [10, 9] },
];

interface Props {
  /** 포지션 문자열("L1"…)→셀 값. InspectionRow 그룹에서 생성. */
  cells: Record<string, SchematicCell>;
  /** 셀 클릭 콜백(선택). */
  onCellClick?: (pos: string) => void;
  /** 하단 캡션(예: "TECHKING · 385/95R24") */
  caption?: string;
}

export default function TireSchematic({ cells, onCellClick, caption }: Props) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="overflow-x-auto pb-2">
        <div className="flex items-stretch gap-1 w-max mx-auto px-2 py-2" style={{ zoom: 1.3 }}>
          <div className="border-2 border-primary rounded-xl px-3 pt-5 pb-3 relative mx-1 flex flex-col">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-background px-2 text-xs font-black text-primary">
              Head
            </span>
            {/* 시계방향 90° 회전 배치 — 축(①②③)은 위→아래, 각 축의 셀은 좌우(R | 라벨 | L). 셀·글자는 가로 유지 */}
            <div className="flex-1 flex items-center justify-center">
              <div className="flex flex-col gap-2 items-center">
                {AXLES.map((axle, ai) => (
                  <div key={ai} className="flex flex-row items-center justify-center gap-1 h-7">
                    <div className="flex flex-row gap-1">
                      {[...axle.bot].reverse().map((p) => (
                        <Cell key={p} pos={p} cells={cells} onCellClick={onCellClick} />
                      ))}
                    </div>
                    <div className="flex items-center justify-center w-6 text-base font-bold text-muted-foreground leading-none">
                      {axle.label}
                    </div>
                    <div className="flex flex-row gap-1">
                      {[...axle.top].reverse().map((p) => (
                        <Cell key={p} pos={p} cells={cells} onCellClick={onCellClick} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {caption && (
              <div className="mt-2 text-[9px] text-muted-foreground text-center">{caption}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Cell({
  pos,
  cells,
  onCellClick,
}: {
  pos: number;
  cells: Record<string, SchematicCell>;
  onCellClick?: (pos: string) => void;
}) {
  const rp = HEAD_MAP[pos];              // 번호 → "L1" 등
  const c = cells[rp];
  const tread = c?.tread ?? null;
  const press = c?.pressure ?? null;
  const st = statusFromValues(tread, press, pos);
  const parts = rp.split(" ");          // "L2 Out" → ["L2","Out"]
  const title = `${rp} · ${press ?? "-"}psi / ${tread != null ? fmtTread(tread) : "-"}mm`;

  return (
    <button
      type="button"
      onClick={onCellClick ? () => onCellClick(rp) : undefined}
      title={title}
      className={`w-10 h-6 rounded border-2 flex flex-col items-center justify-center transition-all ${
        onCellClick ? "hover:scale-105 hover:shadow-lg cursor-pointer" : "cursor-default"
      } ${STATUS_STYLE[st]}`}
    >
      <span className="text-[10px] font-black leading-none">{parts[0]}</span>
      {parts[1] && (
        <span className="text-[8px] font-bold leading-none opacity-80">{parts.slice(1).join(" ")}</span>
      )}
    </button>
  );
}

export { STATUS_STYLE, AXLES };
