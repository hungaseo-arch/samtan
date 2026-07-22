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
import { useAuth, type Role } from "@/auth/AuthProvider";
import LoginCard from "@/auth/LoginCard";
import SetPasswordCard from "@/auth/SetPasswordCard";
import { toast } from "sonner";
import AdminUsersModal from "@/components/AdminUsersModal";
import { LogOut, X, ChevronDown, Menu, ShieldCheck, KeyRound } from "lucide-react";
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

// 상위 그룹(3~4개) → 하위 탭 배치. label은 i18n `nav.g.<id>`.
// 대시보드(dash)는 '홈' 화면 — 로고 클릭으로 이동하며 그룹 탭에는 넣지 않음.
const GROUPS: { id: string; tabs: TabId[] }[] = [
  { id: "vehicle",  tabs: ["layout", "load"] },
  { id: "tire",     tabs: ["repl", "life"] },
  { id: "inspect",  tabs: ["input", "trend", "pressure"] },
];

// 공통 컨테이너 폭 — 헤더·탭내비·배너·메인·푸터 5곳에서 재사용 (정렬 일치 보장)
const CONTAINER = "max-w-6xl mx-auto px-6";

// 역할 배지 배경 — 프로젝트 팔레트(연한 배경 + 어두운 청회색 텍스트 #546E7A)
const ROLE_BADGE_BG: Record<Role, string> = {
  admin: "#E3F2FD", // SOFT BLUE
  staff: "#E8F5E9", // SAGE GREEN
  user: "#ECEFF1",  // PASTEL BLUE-GREY
};

export default function Index() {
  const { lang, setLang, t } = useLang();
  const { user, role, isAdmin, signOut, loading: authLoading, needsPassword } = useAuth();
  const [showUsers, setShowUsers] = useState(false);
  const [showPwChange, setShowPwChange] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [mobileMenu, setMobileMenu] = useState(false);
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


  // 초대 수락·비밀번호 재설정 링크로 들어온 경우 — 비밀번호부터 정하게 한다.
  if (needsPassword) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <div className="h-1 w-full bg-primary fixed top-0 left-0" />
        <SetPasswordCard
          heading={t("pw.inviteTitle")}
          className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-xl"
        />
      </div>
    );
  }

  // 로그인 전에는 앱을 노출하지 않는다 — 접속 즉시 로그인 화면.
  if (!user) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <div className="h-1 w-full bg-primary fixed top-0 left-0" />
        {authLoading ? (
          <RefreshCw className="w-8 h-8 text-primary animate-spin" />
        ) : (
          <LoginCard
            heading={t("auth.login")}
            className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-xl"
          />
        )}
      </div>
    );
  }

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
        <div className="w-full relative flex flex-row items-center justify-between gap-3 px-4 py-3 sm:px-8 lg:px-12.5 sm:py-4">
          {/* 좌: 햄버거(모바일) / 로고+TMS(데스크톱, 클릭 시 홈) */}
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setMobileMenu((o) => !o)}
              aria-label="menu"
              className="sm:hidden p-2 -ml-1 rounded-lg text-primary hover:bg-muted/40 transition-colors"
            >
              {mobileMenu ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <button
              onClick={() => { setFocusSerial(null); setFocusCh(null); setActiveTab("dash"); setOpenMenu(null); }}
              title="홈"
              className="hidden sm:flex items-center gap-3 min-w-0 hover:opacity-80 transition-opacity"
            >
              <img src={`${import.meta.env.BASE_URL}logo.png`} alt="삼탄 TMS 로고 · 홈" className="hidden lg:block h-6 w-auto shrink-0" />
              <span className="hidden lg:block h-5 w-1 bg-border shrink-0" aria-hidden="true" />
              <h1 className="text-lg sm:text-xl font-extrabold tracking-tight text-primary leading-none shrink-0">TMS</h1>
            </button>
          </div>

          {/* 가운데: 그룹 내비게이션 (데스크톱, 하위 탭은 드롭다운) */}
          <nav className="hidden sm:flex flex-wrap justify-center gap-1">
            {GROUPS.map((g) => {
              const on = g.tabs.includes(activeTab);
              const single = g.tabs.length === 1;
              const selectTab = (tid: TabId) => { setFocusSerial(null); setFocusCh(null); setActiveTab(tid); setOpenMenu(null); };
              return (
                <div key={g.id} className="relative">
                  <button
                    onClick={() => (single ? selectTab(g.tabs[0]) : setOpenMenu(openMenu === g.id ? null : g.id))}
                    className={`flex items-center gap-1 px-5 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-all ${
                      on ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                    }`}
                  >
                    {t(`nav.g.${g.id}`)}
                    {!single && <ChevronDown className={`w-3.5 h-3.5 transition-transform ${openMenu === g.id ? "rotate-180" : ""}`} />}
                  </button>
                  {!single && openMenu === g.id && (
                    <>
                      {/* 바깥 클릭 시 닫기 */}
                      <div className="fixed inset-0 z-40" onClick={() => setOpenMenu(null)} />
                      <div className="absolute left-1/2 -translate-x-1/2 mt-1 z-50 min-w-48 rounded-lg border border-border bg-card shadow-lg py-1">
                        {g.tabs.map((tid) => {
                          const tab = TABS.find((t) => t.id === tid)!;
                          const cur = activeTab === tid;
                          return (
                            <button
                              key={tid}
                              onClick={() => selectTab(tid)}
                              className={`w-full flex items-center gap-2 px-4 py-2 text-sm whitespace-nowrap text-left transition-colors ${
                                cur ? "text-primary font-bold bg-primary/5" : "text-foreground hover:bg-muted/40"
                              }`}
                            >
                              {tab.icon}
                              {t(`tab.${tid}.label`)}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </nav>

          {/* 우: 언어 전환(KO/ID) + 로그인 정보 */}
          <div className="flex items-center gap-3">
            {/* 언어 토글 (KO / ID) */}
            <div className="flex items-center rounded-lg border border-border overflow-hidden shrink-0" role="group" aria-label={t("lang.aria")}>
              {LANGS.map((l) => (
                <button
                  key={l.code}
                  onClick={() => setLang(l.code)}
                  aria-pressed={lang === l.code}
                  className={`flex items-center gap-1 px-2.5 py-1 text-xs font-bold transition-colors ${lang === l.code ? "bg-primary text-primary-foreground" : "bg-white text-muted-foreground hover:text-foreground"}`}
                >
                  <span className="text-sm leading-none">{l.flag}</span>
                  {l.code.toUpperCase()}
                </button>
              ))}
            </div>
            {/* 로그인 시 역할 배지·이메일·로그아웃 표시 (로그인은 점검 입력 탭의 버튼 → 모달) */}
            {user && (
              <span
                aria-label={t("role.badge.aria")}
                className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold"
                style={{ backgroundColor: ROLE_BADGE_BG[role], color: "#546E7A" }}
              >
                {t(`role.${role}`)}
              </span>
            )}
            {/* 비밀번호 변경 */}
            {user && (
              <button
                onClick={() => setShowPwChange(true)}
                title={t("pw.changeTitle")}
                aria-label={t("pw.changeTitle")}
                className="shrink-0 p-1 text-muted-foreground hover:text-primary transition-colors"
              >
                <KeyRound className="w-4 h-4" />
              </button>
            )}
            {/* 사용자 관리 — admin 에게만 노출(실제 권한 검사는 Edge Function) */}
            {isAdmin && (
              <button
                onClick={() => setShowUsers(true)}
                title={t("admin.users")}
                aria-label={t("admin.users")}
                className="shrink-0 p-1 text-muted-foreground hover:text-primary transition-colors"
              >
                <ShieldCheck className="w-4 h-4" />
              </button>
            )}
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

        {/* 모바일 햄버거 메뉴 (반응형) */}
        {mobileMenu && (
          <div className="sm:hidden border-t border-border bg-card px-4 py-2">
            <button
              onClick={() => { setFocusSerial(null); setFocusCh(null); setActiveTab("dash"); setMobileMenu(false); }}
              className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-bold text-left ${activeTab === "dash" ? "bg-primary/5 text-primary" : "text-foreground hover:bg-muted/40"}`}
            >
              <LayoutDashboard className="w-4 h-4" /> {t("tab.dash.label")}
            </button>
            {GROUPS.map((g) => (
              <div key={g.id} className="mt-1">
                <p className="px-3 pt-2 pb-0.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{t(`nav.g.${g.id}`)}</p>
                {g.tabs.map((tid) => {
                  const tab = TABS.find((t) => t.id === tid)!;
                  const cur = activeTab === tid;
                  return (
                    <button
                      key={tid}
                      onClick={() => { setFocusSerial(null); setFocusCh(null); setActiveTab(tid); setMobileMenu(false); }}
                      className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-left ${cur ? "bg-primary/5 text-primary font-bold" : "text-foreground hover:bg-muted/40"}`}
                    >
                      {tab.icon}
                      {t(`tab.${tid}.label`)}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
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
          {activeTab === "input"    && <InspectionTab onSaved={reloadData} onSerialClick={goToSerial} />}
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
          <p className="text-xs text-muted-foreground">
            Copyright © ASEOA · 2026
          </p>
        </div>
      </footer>

      {/* ── 비밀번호 변경 모달 (헤더) ── */}
      {showPwChange && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
          onClick={() => setShowPwChange(false)}
        >
          <div className="relative w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setShowPwChange(false)}
              aria-label="close"
              className="absolute -top-3 -right-3 z-10 p-1.5 rounded-full bg-card border border-border shadow hover:bg-muted/50 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <SetPasswordCard
              heading={t("pw.changeTitle")}
              onDone={() => { setShowPwChange(false); toast.success(t("pw.changed")); }}
              onCancel={() => setShowPwChange(false)}
              className="rounded-2xl border border-border bg-card p-6 shadow-2xl"
            />
          </div>
        </div>
      )}

      {/* ── 사용자 관리 모달 (admin 전용) ── */}
      {showUsers && isAdmin && <AdminUsersModal onClose={() => setShowUsers(false)} />}
    </div>
  );
}
