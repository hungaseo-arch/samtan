// @section: tms-main-page
import { useState, useEffect, useCallback } from "react";
import { loadData } from "@/data/loadData";
import DashboardTab from "@/components/DashboardTab";
import LayoutTab from "@/components/LayoutTab";
import TrendTab from "@/components/TrendTab";
import LifeTab from "@/components/LifeTab";
import ReplacementTab from "@/components/ReplacementTab";
import PressureTab from "@/components/PressureTab";
import InspectionTab from "@/components/InspectionTab";
import LoadTab from "@/components/LoadTab";
import { useLang, LANGS } from "@/i18n";
import { useAuth } from "@/auth/AuthProvider";
import { LogOut } from "lucide-react";
import { LayoutDashboard, Map, Weight, TrendingDown, Database, Gauge, SquarePen, ArrowLeftRight, RefreshCw, AlertTriangle } from "lucide-react";

type TabId = "dash" | "layout" | "load" | "repl" | "life" | "trend" | "pressure" | "input";

// label·desc는 i18n 사전(`tab.<id>.label/desc`)에서 가져옵니다. sub(영문 약칭)·icon은 공통.
const TABS: { id: TabId; sub: string; icon: React.ReactNode }[] = [
  { id: "dash",     sub: "Dashboard",   icon: <LayoutDashboard className="w-4 h-4" /> },
  { id: "layout",   sub: "Layout",      icon: <Map className="w-4 h-4" /> },
  { id: "load",     sub: "Load",        icon: <Weight className="w-4 h-4" /> },
  { id: "repl",     sub: "Replacement", icon: <ArrowLeftRight className="w-4 h-4" /> },
  { id: "life",     sub: "Lifetime DB", icon: <Database className="w-4 h-4" /> },
  { id: "input",    sub: "Input",       icon: <SquarePen className="w-4 h-4" /> },
  { id: "trend",    sub: "Trend",       icon: <TrendingDown className="w-4 h-4" /> },
  { id: "pressure", sub: "Pressure",    icon: <Gauge className="w-4 h-4" /> },
];

// 공통 컨테이너 폭 — 헤더·탭내비·배너·메인·푸터 5곳에서 재사용 (정렬 일치 보장)
const CONTAINER = "max-w-6xl mx-auto px-6";

export default function Index() {
  const { lang, setLang, t } = useLang();
  const { user, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>("dash");
  // 전체 데이터는 Supabase에서 로드. version 변경 시 차트 탭 재렌더.
  const [dataVersion, setDataVersion] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errMsg, setErrMsg] = useState("");

  const reloadData = useCallback(async () => {
    try {
      await loadData();
      setDataVersion((v) => v + 1);
      setStatus("ready");
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "데이터 로드 실패");
      setStatus("error");
    }
  }, []);

  useEffect(() => { reloadData(); }, [reloadData]);

  // 시리얼 클릭 → 교체·수명 DB로 이동 + 해당 행 포커스
  const [focusSerial, setFocusSerial] = useState<string | null>(null);
  const goToSerial = useCallback((serial: string) => {
    setFocusSerial(serial);
    setActiveTab("life");
  }, []);

  // 차량 번호 클릭 → 차량 배치도로 이동 + 해당 차량 선택
  const [focusCh, setFocusCh] = useState<string | null>(null);
  const goToVehicle = useCallback((ch: string) => {
    setFocusCh(ch);
    setActiveTab("layout");
  }, []);

  const active = TABS.find((t) => t.id === activeTab);

  if (status !== "ready") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="h-1 w-full bg-primary fixed top-0 left-0" />
        {status === "loading" ? (
          <>
            <RefreshCw className="w-8 h-8 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">{t("loading")}</p>
          </>
        ) : (
          <>
            <AlertTriangle className="w-8 h-8 text-destructive" />
            <p className="text-sm font-semibold text-foreground">{t("error.title")}</p>
            <p className="text-xs text-muted-foreground max-w-md wrapbreak-words">{errMsg}</p>
            <button
              onClick={() => { setStatus("loading"); reloadData(); }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-bold"
            >
              <RefreshCw className="w-4 h-4" /> {t("error.retry")}
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans">

      {/* ── 최상단 얇은 네이비 바 ── */}
      <div className="h-1 w-full bg-primary" />

      {/* ── 헤더 ── */}
      <header className="bg-white border-b border-border sticky top-0 z-40 shadow-sm">
        <div className="w-full relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3" style={{ padding: "20px 50px" }}>
          {/* 1단: 로고 + 상세페이지(현재 탭) 정보 (좌) */}
          <div className="flex items-center gap-3 min-w-0">
            <img src={`${import.meta.env.BASE_URL}logo.png`} alt="삼탄 TMS 로고" className="h-6 w-auto shrink-0" />
            <span className="h-7 w-px bg-border shrink-0" aria-hidden="true" />
            <span className="text-base font-bold text-primary leading-tight truncate min-w-0">{active ? t(`tab.${active.id}.label`) : ""}</span>
          </div>

          {/* 2단: 홈페이지 제목 (가로 화면 가운데) */}
          <h1 className="text-2xl font-extrabold tracking-tight text-primary leading-none whitespace-nowrap sm:absolute sm:left-1/2 sm:-translate-x-1/2 pointer-events-none">
            Tire Monitoring System (TMS)
          </h1>

          {/* 3단: 언어 전환(KO/ID) + 로그인 정보 (우) */}
          <div className="flex items-center gap-3">
            {/* 언어 토글 (KO / ID) */}
            <div className="flex items-center rounded-lg border border-border overflow-hidden shrink-0" role="group" aria-label={t("lang.aria")}>
              {LANGS.map((l) => (
                <button
                  key={l.code}
                  onClick={() => setLang(l.code)}
                  aria-pressed={lang === l.code}
                  className={`px-2.5 py-1 text-xs font-bold transition-colors ${lang === l.code ? "bg-primary text-primary-foreground" : "bg-white text-muted-foreground hover:text-foreground"}`}
                >
                  {l.code.toUpperCase()}
                </button>
              ))}
            </div>
            {/* 로그인 상태 — 로그인 시 이메일·로그아웃 */}
            {user && (
              <button
                onClick={() => signOut()}
                title={user.email ?? undefined}
                className="flex items-center gap-1 shrink-0 text-xs font-semibold text-muted-foreground hover:text-destructive transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden md:inline max-w-28 truncate">{user.email}</span>
                <span className="md:hidden">{t("auth.logout")}</span>
              </button>
            )}
          </div>
        </div>

        {/* ── 탭 내비게이션 (STI Corp 스타일: 언더라인) ── */}
        <div className={CONTAINER}>
          <nav className="flex justify-center gap-0 overflow-x-auto">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => { setFocusSerial(null); setFocusCh(null); setActiveTab(tab.id); }}
                className={`
                  flex items-center gap-1.5 px-5 py-3 text-sm font-semibold whitespace-nowrap
                  border-b-2 transition-all duration-200
                  ${activeTab === tab.id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                  }
                `}
              >
                {tab.icon}
                <span className="hidden sm:inline">{t(`tab.${tab.id}.label`)}</span>
                <span className="sm:hidden">{tab.sub}</span>
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* ── 메인 콘텐츠 ── */}
      <main className="flex-1 bg-background">
        <div className={`${CONTAINER} py-6`}>
          {activeTab === "dash"     && <DashboardTab key={dataVersion} onVehicleClick={goToVehicle} />}
          {activeTab === "layout"   && <LayoutTab key={dataVersion} onSerialClick={goToSerial} focusCh={focusCh} />}
          {activeTab === "load"     && <LoadTab />}
          {activeTab === "repl"     && <ReplacementTab key={dataVersion} onSerialClick={goToSerial} onVehicleClick={goToVehicle} />}
          {activeTab === "trend"    && <TrendTab key={dataVersion} onSerialClick={goToSerial} />}
          {activeTab === "pressure" && <PressureTab key={dataVersion} />}
          {activeTab === "input"    && <InspectionTab onSaved={reloadData} />}
          {activeTab === "life"     && <LifeTab focusSerial={focusSerial} />}
        </div>
      </main>

      {/* ── 푸터 ── */}
      <footer className="border-t border-border bg-white">
        <div className={`${CONTAINER} py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1`}>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-primary">PT. Trasindo Murni Perkasa</span>
            <span className="text-xs text-muted-foreground">·  Kalimantan Field</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Copyright © ASEOA · 2026
          </p>
        </div>
      </footer>
    </div>
  );
}
