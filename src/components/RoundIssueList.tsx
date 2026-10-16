// @section: round-issue-list
// validateRound() 결과 표시 (§A-8). 화면 입력과 일괄 업로드 미리보기가 같이 쓴다.
import { AlertTriangle, XCircle, Repeat } from "lucide-react";
import { useLang } from "@/i18n";
import type { RoundIssue } from "@/lib/roundValidate";
import { ISSUE_TX as TX, issueText } from "@/lib/roundIssueText";

export default function RoundIssueList({
  issues, onReplace,
}: {
  issues: RoundIssue[];
  /** 지정하면 교체 미등록 경고 옆에 [교체 등록] 버튼 */
  onReplace?: (pos: string, serial: string | null) => void;
}) {
  const { lang } = useLang();
  if (!issues.length) return null;
  return (
    <ul className="space-y-1">
      {issues.map((x, i) => {
        const err = x.level === "error";
        return (
          <li
            key={i}
            className={`flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-xs ${
              err ? "border-destructive/40 bg-destructive/5 text-destructive" : "border-level-warn/40 bg-level-warn/10 text-level-warn"
            }`}
          >
            {err ? <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
            <span className="flex-1">{issueText(x, lang)}</span>
            {x.code === "serial_mismatch" && x.pos && onReplace && (
              <button
                type="button"
                onClick={() => onReplace(x.pos!, typeof x.value === "string" ? x.value : null)}
                className="inline-flex items-center gap-1 shrink-0 rounded border border-current px-1.5 py-0.5 font-semibold hover:bg-background/60"
              >
                <Repeat className="w-3 h-3" />
                {TX[lang].replace}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
