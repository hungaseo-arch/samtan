// @section: i18n-provider
// 언어 Context Provider (컴포넌트 전용 — react-refresh 규칙 준수).
import { useCallback, useEffect, useState } from "react";
import { Ctx, DICT, STORAGE_KEY, readStored, type Lang } from "@/i18n";

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readStored);

  useEffect(() => {
    if (typeof document !== "undefined") document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, l);
  }, []);

  const t = useCallback((key: string) => DICT[lang][key] ?? DICT.ko[key] ?? key, [lang]);

  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}
