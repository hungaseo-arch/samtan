// @section: use-dialog
// 모달·메뉴 공통 키보드 동작 (점검보고서 CHK-TMS-2026-10-16-WEB COM-03 · DASH-08 · LAY-11 · REPL-05).
//   · Esc 로 닫는다 — 겹친 모달은 맨 위 하나만 닫힌다 (스택)
//   · 열릴 때 컨테이너로 포커스를 옮기고, Tab 은 컨테이너 안에서만 돈다
//   · 닫히면 열기 전 포커스로 되돌린다
// 컨테이너에는 role="dialog" aria-modal="true" tabIndex={-1} 와 접근 이름을 붙인다.
// 메뉴처럼 포커스를 가두면 안 되는 곳은 { trap: false } 로 Esc 만 쓴다.
import { useEffect, useRef } from "react";

const stack: { current: () => void }[] = [];

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useDialog<T extends HTMLElement = HTMLDivElement>(
  open: boolean,
  onClose: () => void,
  opts: { trap?: boolean } = {},
) {
  const ref = useRef<T>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const trap = opts.trap ?? true;

  useEffect(() => {
    if (!open) return;
    const entry = close;
    stack.push(entry);
    const prev = document.activeElement as HTMLElement | null;
    if (trap) ref.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== entry) return;
      if (e.key === "Escape") {
        e.preventDefault();
        entry.current();
        return;
      }
      if (!trap || e.key !== "Tab" || !ref.current) return;
      const els = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!els.length) { e.preventDefault(); return; }
      const first = els[0], last = els[els.length - 1];
      const at = document.activeElement;
      if (e.shiftKey && (at === first || at === ref.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      const i = stack.lastIndexOf(entry);
      if (i >= 0) stack.splice(i, 1);
      if (trap && prev && document.contains(prev)) prev.focus();
    };
  }, [open, trap]);

  return ref;
}
