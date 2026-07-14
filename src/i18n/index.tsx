// @section: i18n
// 경량 다국어(한국어/인도네시아어) — Context + localStorage 영속화.
// 사용: const { lang, setLang, t } = useLang();  t("tab.dash.label")
// Provider 컴포넌트는 react-refresh(only-export-components) 규칙 때문에 별도 파일(./provider)로 분리.
// 이 파일은 상수·타입·훅(비컴포넌트)만 export 한다.
import { createContext, useContext } from "react";

export type Lang = "ko" | "id";

export const LANGS: { code: Lang; label: string; flag: string }[] = [
  { code: "ko", label: "한국어", flag: "🇰🇷" },
  { code: "id", label: "Bahasa", flag: "🇮🇩" },
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
};

export const DICT: Record<Lang, Dict> = { ko: KO, id: ID };
export const STORAGE_KEY = "tms.lang";

export function readStored(): Lang {
  if (typeof window === "undefined") return "ko";
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === "id" || v === "ko" ? v : "ko";
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
