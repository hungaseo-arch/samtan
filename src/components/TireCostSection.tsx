// @section: tire-cost
// 수명 DB 이력 모달의 «비용» 섹션 (지시서 2026-10-16 §B-1).
//
// 구매가 · 재생 횟수/비용 · 총비용 · 실적 CPK · 예상 CPK. 단가가 하나도 없으면 «설정 필요».
// 개별 구매가는 canWrite 만 고칠 수 있고, 비우면 원가 설정(cost_params) 기본 단가로 돌아간다.
import { useState } from "react";
import { TMS_DATA } from "@/data/tmsData";
import { tireCostOf } from "@/data/tmsUtils";
import { toIdr } from "@/lib/economics";
import { EMPTY, fmtCpk, fmtCurrency, fmtInt } from "@/lib/format";
import { updateLifetimePrice } from "@/api/tires";
import { useAuth } from "@/auth/AuthProvider";
import { useLang } from "@/i18n";

const TX = {
  ko: {
    title: "비용",
    price: "구매가",
    srcPurchase: "개별 입력",
    srcParams: "원가 설정 기본 단가",
    retread: "재생",
    retreadVal: (n: string, c: string) => `${n}회 · ${c}`,
    total: "총비용",
    cpk: "실적 CPK",
    expCpk: "예상 CPK",
    cpkSub: "총비용 ÷ 주행 KM",
    expCpkSub: "총비용 ÷ 예상 KM(0mm)",
    needPrice: "단가 미입력 — 설정 필요 (아래에 구매가를 넣거나 TCO › 원가 설정의 기본 단가)",
    edit: "구매가 수정",
    save: "저장",
    clear: "비우기",
    cancel: "취소",
    confirm: (s: string, v: string) => `${s} 구매가를 ${v} 로 저장합니다.`,
    confirmClear: (s: string) => `${s} 구매가를 비웁니다. 원가 설정 기본 단가로 계산됩니다.`,
    invalid: "0 이상의 숫자를 입력하세요",
    failed: "저장 실패",
  },
  id: {
    title: "Biaya",
    price: "Harga beli",
    srcPurchase: "input per ban",
    srcParams: "harga standar pengaturan biaya",
    retread: "Vulkanisir",
    retreadVal: (n: string, c: string) => `${n}x · ${c}`,
    total: "Total biaya",
    cpk: "CPK aktual",
    expCpk: "CPK prediksi",
    cpkSub: "total biaya ÷ KM tempuh",
    expCpkSub: "total biaya ÷ prediksi KM (0mm)",
    needPrice: "Harga belum diisi — perlu diatur (isi harga beli di bawah atau harga standar di TCO › pengaturan biaya)",
    edit: "Ubah harga beli",
    save: "Simpan",
    clear: "Kosongkan",
    cancel: "Batal",
    confirm: (s: string, v: string) => `Simpan harga beli ${s} sebesar ${v}.`,
    confirmClear: (s: string) => `Kosongkan harga beli ${s}. Perhitungan memakai harga standar pengaturan biaya.`,
    invalid: "Masukkan angka 0 atau lebih",
    failed: "Gagal menyimpan",
  },
  en: {
    title: "Cost",
    price: "Purchase price",
    srcPurchase: "per-tire entry",
    srcParams: "cost settings default price",
    retread: "Retread",
    retreadVal: (n: string, c: string) => `${n}× · ${c}`,
    total: "Total cost",
    cpk: "Actual CPK",
    expCpk: "Projected CPK",
    cpkSub: "total cost ÷ driven KM",
    expCpkSub: "total cost ÷ est. KM (0mm)",
    needPrice: "No price yet — setup needed (enter a purchase price below or the default price in TCO › cost settings)",
    edit: "Edit purchase price",
    save: "Save",
    clear: "Clear",
    cancel: "Cancel",
    confirm: (s: string, v: string) => `Save purchase price of ${s} as ${v}.`,
    confirmClear: (s: string) => `Clear the purchase price of ${s}. The cost-settings default price will be used.`,
    invalid: "Enter a number of 0 or more",
    failed: "Save failed",
  },
};

export default function TireCostSection({ serial, onSaved }: { serial: string; onSaved?: () => void | Promise<void> }) {
  const { lang } = useLang();
  const tx = TX[lang];
  const { canWrite } = useAuth();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const c = tireCostOf(serial);
  if (!c) return null;
  const fx = TMS_DATA.tire.fxUsdIdr;
  const money = (v: number | null) => {
    if (v == null) return EMPTY;
    const idr = toIdr(v, c.currency, fx);
    return idr != null ? `${fmtCurrency(v, c.currency)} (${fmtCurrency(idr, "IDR")})` : fmtCurrency(v, c.currency);
  };
  const perKm = (v: number | null) => {
    if (v == null) return EMPTY;
    const idr = toIdr(v, c.currency, fx);
    return idr != null ? `${fmtCpk(v, c.currency)} (${fmtCpk(idr, "IDR")})` : fmtCpk(v, c.currency);
  };

  const save = async (clear: boolean) => {
    setErr(null);
    let v: number | null = null;
    if (!clear) {
      v = Number(draft.replace(/,/g, ""));
      if (!draft.trim() || !Number.isFinite(v) || v < 0) { setErr(tx.invalid); return; }
    }
    const msg = clear ? tx.confirmClear(serial) : tx.confirm(serial, fmtCurrency(v, c.currency));
    if (!window.confirm(msg)) return;
    setBusy(true);
    try {
      await updateLifetimePrice(serial, v, c.currency);
      setEditing(false);
      await onSaved?.();
    } catch (e) {
      setErr(`${tx.failed}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const Row = ({ label, value, sub, strong }: { label: string; value: string; sub?: string; strong?: boolean }) => (
    <div>
      <span className="text-[11px] text-muted-foreground font-semibold">{label}</span>
      <p className={`font-mono text-xs mt-0.5 ${strong ? "font-bold text-foreground" : ""}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground/70">{sub}</p>}
    </div>
  );

  return (
    <div className="mb-4 rounded-lg border border-border/60 bg-muted/10 p-3">
      <p className="text-xs font-bold text-primary mb-2">{tx.title}</p>
      {c.total == null && <p className="text-xs text-level-warn font-semibold mb-2">{tx.needPrice}</p>}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
        <Row
          label={tx.price}
          value={money(c.price)}
          sub={c.priceSource === "purchase" ? tx.srcPurchase : c.priceSource === "params" ? tx.srcParams : undefined}
        />
        <Row label={tx.retread} value={tx.retreadVal(fmtInt(c.retreadCount), money(c.retreadCost))} />
        <Row label={tx.total} value={money(c.total)} strong />
        <Row label={tx.cpk} value={perKm(c.cpk)} sub={tx.cpkSub} strong />
        <Row label={tx.expCpk} value={perKm(c.expCpk)} sub={tx.expCpkSub} />
      </div>

      {canWrite && (
        <div className="mt-3">
          {editing ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-mono text-muted-foreground">{c.currency}</span>
              <input
                type="text"
                inputMode="decimal"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="w-40 rounded border border-border bg-background px-2 py-1 text-xs font-mono text-right"
                disabled={busy}
              />
              <button onClick={() => save(false)} disabled={busy} className="text-xs font-semibold px-2 py-1 rounded border border-border bg-primary/20 hover:bg-primary/30 disabled:opacity-50">{tx.save}</button>
              {c.priceSource === "purchase" && (
                <button onClick={() => save(true)} disabled={busy} className="text-xs px-2 py-1 rounded border border-border hover:bg-muted/40 disabled:opacity-50">{tx.clear}</button>
              )}
              <button onClick={() => { setEditing(false); setErr(null); }} disabled={busy} className="text-xs px-2 py-1 rounded hover:bg-muted/40">{tx.cancel}</button>
            </div>
          ) : (
            <button
              onClick={() => { setDraft(c.priceSource === "purchase" && c.price != null ? String(c.price) : ""); setEditing(true); }}
              className="text-xs text-primary font-semibold hover:underline"
            >
              {tx.edit}
            </button>
          )}
          {err && <p className="text-xs text-destructive mt-1">{err}</p>}
        </div>
      )}
    </div>
  );
}
