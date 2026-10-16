// @section: load-review-tab
// 하중 검토 — 사내 참고자료(차량 하중 용어 정의 및 Road Train 타이어 하중 검토, 2026-09-12)를 그대로 보여준다.
// 원본은 사용자가 작성한 단일 HTML(src/docs/load-review.html, 원제 "차량하중용어_정의_및_6900XD_타이어하중_검토.html").
// 문서 자체 스타일(프로젝트 팔레트와 동일)을 유지하려고 iframe srcdoc 으로 넣는다 — srcdoc 은 HTTP 응답이 아니라
// public/_headers 의 X-Frame-Options: DENY / frame-ancestors 'none' 에 걸리지 않는다.
// 높이는 문서 본문 높이에 맞춰 조정해 바깥 페이지만 스크롤되게 한다.
import { useCallback, useEffect, useRef } from "react";
import { useLang } from "@/i18n";
import html from "@/docs/load-review.html?raw";

const TX = {
  ko: { title: "하중 검토", sub: "차량 하중 용어 정의 및 Road Train 타이어 하중 검토 — 사내 참고자료 (한국어)", frame: "하중 검토 문서" },
  id: { title: "Tinjauan Beban", sub: "Definisi istilah beban kendaraan & tinjauan beban ban Road Train — referensi internal (bahasa Korea)", frame: "Dokumen tinjauan beban" },
  en: { title: "Load Review", sub: "Vehicle load terminology & Road Train tire load review — internal reference (Korean)", frame: "Load review document" },
} as const;

export default function LoadReviewTab() {
  const { lang } = useLang();
  const tx = TX[lang];
  const ref = useRef<HTMLIFrameElement>(null);

  // 문서 높이에 맞춰 iframe 높이를 잡는다(같은 출처라 contentDocument 접근 가능).
  const fit = useCallback(() => {
    const el = ref.current;
    const body = el?.contentDocument?.body;
    if (el && body) el.style.height = `${body.scrollHeight + 8}px`;
  }, []);

  // 폭이 바뀌면 문서가 다시 흐르므로(반응형 표·다이어그램) 높이를 다시 맞춘다.
  useEffect(() => {
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [fit]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-1 h-5 bg-primary rounded-full" />
        <div>
          <div className="text-sm font-bold text-foreground">{tx.title}</div>
          <div className="text-xs text-muted-foreground">{tx.sub}</div>
        </div>
      </div>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <iframe
          ref={ref}
          title={tx.frame}
          srcDoc={html}
          onLoad={fit}
          className="w-full block border-0"
          style={{ minHeight: "60vh" }}
        />
      </div>
    </div>
  );
}
