// @section: admin-economics-panel
// 관리자 › 판정 기준 › 경제성 계수 (지시서 2026-10-16 §B-3).
//
// 환율·연비·유가·손실 계수. 전부 비워 둘 수 있고(NULL), 비어 있으면 경제성 화면이 «설정 필요» 를 띄운다.
// 지시서 제안값(연료 1.2%/10%, 수명 8%/10%)은 힌트로만 보여 주고 자동으로 채우지 않는다 —
// 확정은 쎄오님 몫이다 (CLAUDE.md 절대금지 6).
import { useMemo, useState } from "react";
import { Loader2, Save, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useLang } from "@/i18n";
import { TMS_DATA } from "@/data/tmsData";
import {
  ECON_NUM_KEYS, updateEconomicsConfig, validateEconomicsConfig, type EconomicsConfig,
} from "@/api/config";

type NumKey = (typeof ECON_NUM_KEYS)[number];

const TX = {
  ko: {
    head: "경제성 계수",
    desc: "경제성(TCO 탭) 추정에 쓰는 가정값입니다. 비워 두면 해당 항목은 «설정 필요» 로 표시됩니다. 현장 실측으로 보정하세요.",
    fx_usd_idr: "환율 — 1 USD 당 IDR",
    fuel_base_l_per_km: "Road Train 기준 연비 (L/km)",
    fuel_price: "경유 단가 (통화/L)",
    fuel_currency: "유가 통화",
    fuel_sens_per_10pct: "저압 10% 당 연료 증가 (%)",
    life_sens_per_10pct: "저압 10% 당 수명 감소 (%)",
    hint: { fuel_sens_per_10pct: "지시서 제안 1.2 (제조사 통상 1~1.5)", life_sens_per_10pct: "지시서 제안 8 (20% 저압 시 15~25% 단축)" } as Partial<Record<NumKey, string>>,
    empty: "미설정",
    invalid: "0 이상의 숫자만 입력하세요 (환율은 0 보다 커야 합니다).",
    confirm: "경제성 계수를 바꿉니다.\n모든 사용자의 추정 손실액이 바뀝니다.",
    save: "저장", reset: "되돌리기",
    saved: "경제성 계수를 저장했습니다", saveFail: "저장 실패: ",
  },
  id: {
    head: "Koefisien ekonomi",
    desc: "Nilai asumsi untuk estimasi ekonomi (tab TCO). Bila dikosongkan, item tersebut tampil «perlu diatur». Koreksi dengan pengukuran lapangan.",
    fx_usd_idr: "Kurs — IDR per 1 USD",
    fuel_base_l_per_km: "Konsumsi BBM dasar Road Train (L/km)",
    fuel_price: "Harga solar (mata uang/L)",
    fuel_currency: "Mata uang BBM",
    fuel_sens_per_10pct: "Kenaikan BBM per 10% tekanan rendah (%)",
    life_sens_per_10pct: "Penurunan umur per 10% tekanan rendah (%)",
    hint: { fuel_sens_per_10pct: "Usulan instruksi 1,2 (umum pabrikan 1–1,5)", life_sens_per_10pct: "Usulan instruksi 8 (20% rendah → 15–25% lebih pendek)" } as Partial<Record<NumKey, string>>,
    empty: "belum diatur",
    invalid: "Isi hanya angka 0 atau lebih (kurs harus lebih dari 0).",
    confirm: "Ubah koefisien ekonomi?\nEstimasi kerugian berubah untuk semua pengguna.",
    save: "Simpan", reset: "Kembalikan",
    saved: "Koefisien ekonomi disimpan", saveFail: "Gagal menyimpan: ",
  },
  en: {
    head: "Economics coefficients",
    desc: "Assumed values for the economics estimates (TCO tab). Left blank, the item shows «setup needed». Calibrate with field measurements.",
    fx_usd_idr: "Exchange rate — IDR per 1 USD",
    fuel_base_l_per_km: "Road Train base fuel use (L/km)",
    fuel_price: "Diesel price (currency/L)",
    fuel_currency: "Fuel currency",
    fuel_sens_per_10pct: "Fuel increase per 10% under-inflation (%)",
    life_sens_per_10pct: "Life reduction per 10% under-inflation (%)",
    hint: { fuel_sens_per_10pct: "Work order suggests 1.2 (makers' typical 1–1.5)", life_sens_per_10pct: "Work order suggests 8 (20% low → 15–25% shorter)" } as Partial<Record<NumKey, string>>,
    empty: "not set",
    invalid: "Enter numbers of 0 or more only (exchange rate must be above 0).",
    confirm: "Change the economics coefficients?\nEstimated losses change for every user.",
    save: "Save", reset: "Revert",
    saved: "Economics coefficients saved", saveFail: "Save failed: ",
  },
};

type Draft = Record<NumKey, string> & { fuel_currency: string };

function currentDraft(): Draft {
  const t = TMS_DATA.tire;
  const s = (v: number | null) => (v == null ? "" : String(v));
  return {
    fx_usd_idr: s(t.fxUsdIdr),
    fuel_base_l_per_km: s(t.fuelBaseLPerKm),
    fuel_price: s(t.fuelPrice),
    fuel_currency: t.fuelCurrency || "IDR",
    fuel_sens_per_10pct: s(t.fuelSensPer10Pct),
    life_sens_per_10pct: s(t.lifeSensPer10Pct),
  };
}

function toConfig(d: Draft): EconomicsConfig {
  const n = (v: string) => (v.trim() === "" ? null : Number(v));
  return {
    fx_usd_idr: n(d.fx_usd_idr),
    fuel_base_l_per_km: n(d.fuel_base_l_per_km),
    fuel_price: n(d.fuel_price),
    fuel_currency: d.fuel_currency,
    fuel_sens_per_10pct: n(d.fuel_sens_per_10pct),
    life_sens_per_10pct: n(d.life_sens_per_10pct),
  };
}

export default function EconomicsSettingsPanel({ onSaved }: { onSaved?: () => void | Promise<void> }) {
  const { lang } = useLang();
  const tx = TX[lang];
  const [initial, setInitial] = useState<Draft>(currentDraft);
  const [draft, setDraft] = useState<Draft>(initial);
  const [busy, setBusy] = useState(false);

  const bad = useMemo(() => new Set(validateEconomicsConfig(toConfig(draft))), [draft]);
  const dirty = (Object.keys(draft) as (keyof Draft)[]).some((k) => draft[k] !== initial[k]);

  const handleSave = async () => {
    if (bad.size > 0) { toast.error(tx.invalid); return; }
    if (!window.confirm(tx.confirm)) return;
    setBusy(true);
    try {
      await updateEconomicsConfig(toConfig(draft));
      await onSaved?.();
      const next = currentDraft();
      setInitial(next);
      setDraft(next);
      toast.success(tx.saved);
    } catch (e) {
      toast.error(tx.saveFail + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };

  const inputCls = (k: string) =>
    `w-32 shrink-0 rounded-lg border bg-background px-2 py-1.5 text-sm text-right tabular-nums ${bad.has(k) ? "border-destructive" : "border-border"}`;

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
      <div>
        <h3 className="text-sm font-bold">{tx.head}</h3>
        <p className="text-xs text-muted-foreground">{tx.desc}</p>
      </div>

      <div className="grid gap-x-6 gap-y-2 md:grid-cols-2">
        {ECON_NUM_KEYS.map((k) => (
          <label key={k} className="flex items-center justify-between gap-3 text-xs">
            <span className="min-w-0">
              {tx[k]}
              {tx.hint[k] && <span className="block text-[11px] text-muted-foreground">{tx.hint[k]}</span>}
            </span>
            <input
              type="number"
              inputMode="decimal"
              step="any"
              min={0}
              value={draft[k]}
              placeholder={tx.empty}
              onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
              aria-invalid={bad.has(k)}
              className={inputCls(k)}
            />
          </label>
        ))}
        <label className="flex items-center justify-between gap-3 text-xs">
          <span>{tx.fuel_currency}</span>
          <select
            value={draft.fuel_currency}
            onChange={(e) => setDraft((d) => ({ ...d, fuel_currency: e.target.value }))}
            className={inputCls("fuel_currency")}
          >
            <option value="IDR">IDR</option>
            <option value="USD">USD</option>
          </select>
        </label>
      </div>

      {bad.size > 0 && <p className="text-xs text-destructive">{tx.invalid}</p>}

      <div className="flex justify-end gap-2">
        <button
          onClick={() => setDraft(initial)}
          disabled={busy || !dirty}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-bold disabled:opacity-50 hover:bg-muted/40 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" /> {tx.reset}
        </button>
        <button
          onClick={handleSave}
          disabled={busy || !dirty || bad.size > 0}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold disabled:opacity-50 hover:bg-primary/90 transition-colors"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {tx.save}
        </button>
      </div>
    </div>
  );
}
