// @section: serial-chain
// 포지션 시리얼 이력을 A → B → C … 로 렌더링. 개수 제한 없음(과거 2칸 고정 구조를 대체).
// 화살표 아래에는 그 다음 타이어의 교체일을 작게 표기한다.
// 마지막 항목 = 현재 장착 타이어(강조), 앞쪽 = 탈거된 과거 타이어(흐리게).
// LayoutTab · TireDetailModal 공용.
import { Fragment } from "react";
import type { SerialChainEntry } from "@/data/tmsData";
import { EMPTY } from "@/lib/format";

export default function SerialChain({
  chain,
  fallbackSerial,
  onSerialClick,
  hint,
}: {
  chain: SerialChainEntry[];
  /** 체인이 비어 있을 때(뷰 미적용 환경 등) 표시할 현재 시리얼 */
  fallbackSerial?: string;
  onSerialClick?: (serial: string) => void;
  /** 클릭 안내 문구 */
  hint?: string;
}) {
  const items: SerialChainEntry[] =
    chain.length > 0
      ? chain
      : fallbackSerial
        ? [{ seqNo: 0, serial: fallbackSerial, mountedAt: null, source: "initial" }]
        : [];

  if (!items.length) return <span className="text-xs font-mono text-muted-foreground">{EMPTY}</span>;

  return (
    <span className="text-xs font-mono">
      <span className="inline-flex flex-wrap items-start gap-x-1">
        {items.map((c, i) => {
          const isCurrent = i === items.length - 1;
          return (
            <Fragment key={`${c.seqNo}-${c.serial}`}>
              {i > 0 && (
                <span className="inline-flex flex-col items-center leading-none px-0.5">
                  <span className="text-muted-foreground">→</span>
                  {c.mountedAt && (
                    <span className="text-[9px] text-muted-foreground/70 mt-0.5 whitespace-nowrap">
                      {c.mountedAt}
                    </span>
                  )}
                </span>
              )}
              <button
                type="button"
                onClick={() => onSerialClick?.(c.serial)}
                className={`hover:underline ${
                  isCurrent ? "text-primary font-bold" : "text-muted-foreground"
                }`}
              >
                {c.serial}
              </button>
            </Fragment>
          );
        })}
      </span>
      {hint && <span className="block text-[10px] text-muted-foreground/70">{hint}</span>}
    </span>
  );
}
