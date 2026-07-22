// @section: i18n
// 경량 다국어(인도네시아어/한국어/영어) — Context + localStorage 영속화.
// 로그인 후 앱의 기본 언어는 인도네시아어(현장 사용자 기준). 헤더 토글로 변경하면 localStorage 에 남는다.
// 로그인 화면만은 언어 토글이 없어 항상 영어로 표시한다(LoginCard forceEn).
// 사용: const { lang, setLang, t } = useLang();  t("tab.dash.label")
// Provider 컴포넌트는 react-refresh(only-export-components) 규칙 때문에 별도 파일(./provider)로 분리.
// 이 파일은 상수·타입·훅(비컴포넌트)만 export 한다.
import { createContext, useContext } from "react";

export type Lang = "id" | "ko" | "en";

export const LANGS: { code: Lang; label: string; flag: string }[] = [
  { code: "id", label: "Bahasa", flag: "🇮🇩" },
  { code: "ko", label: "한국어", flag: "🇰🇷" },
  { code: "en", label: "English", flag: "🇬🇧" },
];

type Dict = Record<string, string>;

const KO: Dict = {
  "tab.dash.label": "대시보드",
  "tab.layout.label": "차량 배치도",
  "tab.load.label": "하중계산",
  "tab.repl.label": "타이어 교체 이력",
  "tab.life.label": "타이어 수명 DB",
  "tab.input.label": "점검 입력",
  "tab.trend.label": "압력·트레드 추이",
  "tab.pressure.label": "타이어 공기압관리",
  "loading": "데이터를 불러오는 중…",
  "error.title": "데이터를 불러오지 못했습니다.",
  "error.retry": "다시 시도",
  "lang.aria": "언어 선택",
  "nav.g.vehicle": "차량",
  "nav.g.tire": "타이어",
  "nav.g.inspect": "점검·측정",
  "auth.login": "로그인",
  "auth.logout": "로그아웃",
  "auth.email": "이메일",
  "auth.password": "비밀번호",
  "auth.signIn": "로그인",
  "auth.signingIn": "로그인 중…",
  "auth.required": "점검 입력은 로그인이 필요합니다.",
  "auth.desc": "현장 관리자 계정으로 로그인하세요.",
  "auth.failed": "로그인 실패 — 이메일/비밀번호를 확인하세요.",
  "admin.users": "사용자 관리",
  "pw.setTitle": "비밀번호 설정",
  "pw.changeTitle": "비밀번호 변경",
  "pw.desc": "8자 이상으로 설정하세요.",
  "pw.name": "이름",
  "pw.namePh": "예: 홍길동",
  "pw.needName": "이름을 입력하세요.",
  "pw.new": "새 비밀번호",
  "pw.confirm": "새 비밀번호 확인",
  "pw.save": "저장",
  "pw.cancel": "취소",
  "pw.tooShort": "비밀번호는 8자 이상이어야 합니다.",
  "pw.mismatch": "두 비밀번호가 일치하지 않습니다.",
  "pw.changed": "비밀번호를 변경했습니다.",
  "pw.inviteTitle": "환영합니다 — 비밀번호를 설정하세요",
  "pw.forgot": "비밀번호를 잊으셨나요? 관리자에게 초기화를 요청하세요.",
  "auth.gateDesc": "계속하려면 로그인하세요.",
  "role.admin": "관리자",
  "role.inspector": "점검",
  "role.viewer": "조회",
  "role.badge.aria": "현재 권한 등급",
};

const ID: Dict = {
  "tab.dash.label": "Dasbor",
  "tab.layout.label": "Tata Letak",
  "tab.load.label": "Perhitungan Beban",
  "tab.repl.label": "Riwayat Penggantian",
  "tab.life.label": "DB Umur Ban",
  "tab.input.label": "Input Inspeksi",
  "tab.trend.label": "Tren Tekanan·Tapak",
  "tab.pressure.label": "Manajemen Tekanan",
  "loading": "Memuat data…",
  "error.title": "Gagal memuat data.",
  "error.retry": "Coba lagi",
  "lang.aria": "Pilih bahasa",
  "nav.g.vehicle": "Kendaraan",
  "nav.g.tire": "Ban",
  "nav.g.inspect": "Inspeksi",
  "auth.login": "Masuk",
  "auth.logout": "Keluar",
  "auth.email": "Email",
  "auth.password": "Kata sandi",
  "auth.signIn": "Masuk",
  "auth.signingIn": "Sedang masuk…",
  "auth.required": "Input inspeksi memerlukan login.",
  "auth.desc": "Masuk dengan akun pengawas lapangan.",
  "auth.failed": "Gagal masuk — periksa email/kata sandi.",
  "admin.users": "Manajemen Pengguna",
  "pw.setTitle": "Atur kata sandi",
  "pw.changeTitle": "Ubah kata sandi",
  "pw.desc": "Gunakan minimal 8 karakter.",
  "pw.name": "Nama",
  "pw.namePh": "cth: Budi",
  "pw.needName": "Masukkan nama Anda.",
  "pw.new": "Kata sandi baru",
  "pw.confirm": "Konfirmasi kata sandi",
  "pw.save": "Simpan",
  "pw.cancel": "Batal",
  "pw.tooShort": "Kata sandi minimal 8 karakter.",
  "pw.mismatch": "Kata sandi tidak cocok.",
  "pw.changed": "Kata sandi diubah.",
  "pw.inviteTitle": "Selamat datang — atur kata sandi Anda",
  "pw.forgot": "Lupa kata sandi? Minta administrator untuk mereset.",
  "auth.gateDesc": "Masuk untuk melanjutkan.",
  "role.admin": "Admin",
  "role.inspector": "Inspektur",
  "role.viewer": "Pelihat",
  "role.badge.aria": "Tingkat izin saat ini",
};

const EN: Dict = {
  "tab.dash.label": "Dashboard",
  "tab.layout.label": "Vehicle Layout",
  "tab.load.label": "Load Calculation",
  "tab.repl.label": "Replacement History",
  "tab.life.label": "Tire Lifetime DB",
  "tab.input.label": "Inspection Input",
  "tab.trend.label": "Pressure·Tread Trend",
  "tab.pressure.label": "Tire Pressure Management",
  "loading": "Loading data…",
  "error.title": "Failed to load data.",
  "error.retry": "Retry",
  "lang.aria": "Select language",
  "nav.g.vehicle": "Vehicle",
  "nav.g.tire": "Tire",
  "nav.g.inspect": "Inspection",
  "auth.login": "Sign in",
  "auth.logout": "Sign out",
  "auth.email": "Email",
  "auth.password": "Password",
  "auth.signIn": "Sign in",
  "auth.signingIn": "Signing in…",
  "auth.required": "Inspection input requires sign-in.",
  "auth.desc": "Sign in with your field supervisor account.",
  "auth.failed": "Sign-in failed — check your email/password.",
  "admin.users": "User Management",
  "pw.setTitle": "Set password",
  "pw.changeTitle": "Change password",
  "pw.desc": "Use at least 8 characters.",
  "pw.name": "Name",
  "pw.namePh": "e.g. John Doe",
  "pw.needName": "Please enter your name.",
  "pw.new": "New password",
  "pw.confirm": "Confirm password",
  "pw.save": "Save",
  "pw.cancel": "Cancel",
  "pw.tooShort": "Password must be at least 8 characters.",
  "pw.mismatch": "Passwords do not match.",
  "pw.changed": "Password changed.",
  "pw.inviteTitle": "Welcome — set your password",
  "pw.forgot": "Forgot your password? Ask an administrator to reset it.",
  "auth.gateDesc": "Sign in to continue.",
  "role.admin": "Admin",
  "role.inspector": "Inspector",
  "role.viewer": "Viewer",
  "role.badge.aria": "Current permission level",
};

export const DICT: Record<Lang, Dict> = { id: ID, ko: KO, en: EN };
export const STORAGE_KEY = "tms.lang";

/** 날짜·숫자 서식용 BCP-47 로케일 — Intl 계열 API 에 넘긴다. */
export const LOCALE: Record<Lang, string> = { id: "id-ID", ko: "ko-KR", en: "en-US" };

export function readStored(): Lang {
  if (typeof window === "undefined") return "id";
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === "id" || v === "ko" || v === "en" ? v : "id";
}

export interface LangCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
}

export const Ctx = createContext<LangCtx | null>(null);

// LanguageProvider 컴포넌트는 ./provider 로 이동 (react-refresh 규칙).

export function useLang(): LangCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useLang must be used within LanguageProvider");
  return c;
}
