// @section: admin-meter-offset-panel
// 관리자 페이지 › 판정 기준 › 계기 리셋 보정 (지시서 2026-10-16 §A-9).
//
// 차량별 리셋일과 리셋 직전 누적 HM·KM 을 받는다. 저장하면 onSaved 가 loadData() 를 다시 돌려
// buildRounds() 가 리셋일 이후 회차에 offset 을 더한 연속 시계열을 만든다.
// 힌트로 리셋일 직전 회차의 계기값을 보여 준다 — 그 값이 보통 offset 이다.
import { useMemo, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { useLang } from "@/i18n";
import { TMS_DATA } from "@/data/tmsData";
import { updateVehicleMeterOffset } from "@/api/vehicles";
import { lastBeforeReset } from "@/lib/meterOffset";
import { fmtMeter, todayInField } from "@/lib/format";

const TX = {
  ko: {
    head: "계기 리셋 보정 (HM·KM)",
    desc: "계기를 교체·리셋한 차량은 리셋일과 리셋 직전 누적값을 입력하세요. 리셋일(포함) 이후 회차에 더해 연속 시계열로 계산합니다. 점검 원본은 바뀌지 않습니다.",
    colCh: "차량", colDate: "리셋일", colHm: "리셋 직전 HM", colKm: "리셋 직전 KM", colHint: "리셋일 직전 회차 값",
    flag: "리셋 차량", save: "저장",
    saved: "보정값을 저장했습니다", saveFail: "저장 실패: ",
    invalid: "리셋일은 오늘 이전이어야 하고, 보정값은 0 이상이며 하나 이상 입력해야 합니다.",
    confirm: (ch: string) => `CH ${ch} 의 계기 보정값을 저장하시겠습니까?\n모든 화면의 HM·KM 이 바뀝니다.`,
    clearHint: "리셋일을 비우면 보정이 해제됩니다.",
  },
  id: {
    head: "Koreksi Reset Meter (HM·KM)",
    desc: "Untuk Unit yang meternya diganti/direset, masukkan tanggal reset dan akumulasi sebelum reset. Nilai ditambahkan pada Pemeriksaan sejak tanggal reset (termasuk) agar menjadi deret berkelanjutan. Data asli tidak berubah.",
    colCh: "Unit", colDate: "Tanggal reset", colHm: "HM sebelum reset", colKm: "KM sebelum reset", colHint: "Nilai Pemeriksaan sebelum reset",
    flag: "Unit reset", save: "Simpan",
    saved: "Koreksi disimpan", saveFail: "Gagal menyimpan: ",
    invalid: "Tanggal reset harus sebelum hari ini, nilai koreksi ≥ 0 dan minimal satu diisi.",
    confirm: (ch: string) => `Simpan koreksi meter CH ${ch}?\nHM·KM di semua layar akan berubah.`,
    clearHint: "Kosongkan tanggal reset untuk membatalkan koreksi.",
  },
  en: {
    head: "Meter Reset Offset (HM·KM)",
    desc: "For vehicles whose meter was replaced or reset, enter the reset date and the total just before the reset. It is added to inspections from the reset date (inclusive) to form a continuous series. Source records are not changed.",
    colCh: "Unit", colDate: "Reset date", colHm: "HM before reset", colKm: "KM before reset", colHint: "Last inspection before reset",
    flag: "Reset unit", save: "Save",
    saved: "Offset saved", saveFail: "Save failed: ",
    invalid: "Reset date must not be in the future; offsets must be ≥ 0 and at least one is required.",
    confirm: (ch: string) => `Save the meter offset for CH ${ch}?\nHM·KM change on every screen.`,
    clearHint: "Clear the reset date to remove the offset.",
  },
} as const;

interface Row { date: string; hm: string; km: string }

function initialRows(): Record<string, Row> {
  const out: Record<string, Row> = {};
  for (const u of TMS_DATA.units) {
    const o = u.meterOffset;
    out[u.ch] = { date: o?.resetDate ?? "", hm: o?.hm != null ? String(o.hm) : "", km: o?.km != null ? String(o.km) : "" };
  }
  return out;
}

const num = (s: string) => (s.trim() === "" ? null : Number(s));

function rowValid(r: Row, today: string): boolean {
  if (!r.date) return true; // 해제
  if (r.date > today) return false;
  const hm = num(r.hm), km = num(r.km);
  if (hm == null && km == null) return false;
  return [hm, km].every((x) => x == null || (Number.isFinite(x) && x >= 0));
}

export default function MeterOffsetPanel({ onSaved }: { onSaved?: () => void | Promise<void> }) {
  const { lang } = useLang();
  const tx = TX[lang];
  const today = todayInField();
  const [initial, setInitial] = useState(initialRows);
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);

  const units = useMemo(
    () => [...TMS_DATA.units].sort((a, b) => Number(!!b.hmReset) - Number(!!a.hmReset) || a.ch.localeCompare(b.ch)),
    [],
  );

  const save = async (ch: string) => {
    const r = rows[ch];
    if (!rowValid(r, today)) { toast.error(tx.invalid); return; }
    if (!window.confirm(tx.confirm(ch))) return;
    setBusy(ch);
    try {
      await updateVehicleMeterOffset(ch, { resetDate: r.date || null, hmOffset: num(r.hm), kmOffset: num(r.km) });
      await onSaved?.();
      const next = initialRows();
      setInitial(next);
      setRows(next);
      toast.success(tx.saved);
    } catch (e) {
      toast.error(tx.saveFail + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(null);
    }
  };

  const input = "w-full rounded-lg border bg-background px-2 py-1 text-sm tabular-nums";

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div>
        <h3 className="text-sm font-bold">{tx.head}</h3>
        <p className="text-xs text-muted-foreground">{tx.desc}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-xs">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="px-2 py-1.5 text-left">{tx.colCh}</th>
              <th className="px-2 py-1.5 text-left">{tx.colDate}</th>
              <th className="px-2 py-1.5 text-right">{tx.colHm}</th>
              <th className="px-2 py-1.5 text-right">{tx.colKm}</th>
              <th className="px-2 py-1.5 text-right">{tx.colHint}</th>
              <th className="px-2 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {units.map((u) => {
              const r = rows[u.ch] ?? { date: "", hm: "", km: "" };
              const init = initial[u.ch];
              const dirty = !init || r.date !== init.date || r.hm !== init.hm || r.km !== init.km;
              const ok = rowValid(r, today);
              const hintHm = r.date ? lastBeforeReset(u.dates, u.hm, r.date) : null;
              const hintKm = r.date ? lastBeforeReset(u.dates, u.km, r.date) : null;
              const set = (k: keyof Row) => (e: React.ChangeEvent<HTMLInputElement>) =>
                setRows((s) => ({ ...s, [u.ch]: { ...r, [k]: e.target.value } }));
              return (
                <tr key={u.ch} className="border-b border-border/50">
                  <td className="px-2 py-1.5 font-semibold whitespace-nowrap">
                    CH {u.ch}
                    {u.hmReset && <span className="ml-1.5 text-[10px] font-semibold text-level-warn">{tx.flag}</span>}
                  </td>
                  <td className="px-2 py-1.5">
                    <input type="date" max={today} value={r.date} onChange={set("date")}
                      className={`${input} ${ok ? "border-border" : "border-destructive"}`} />
                  </td>
                  <td className="px-2 py-1.5">
                    <input type="number" inputMode="decimal" min={0} step={0.1} value={r.hm} onChange={set("hm")}
                      disabled={!r.date} className={`${input} text-right border-border disabled:opacity-50`} />
                  </td>
                  <td className="px-2 py-1.5">
                    <input type="number" inputMode="decimal" min={0} step={0.1} value={r.km} onChange={set("km")}
                      disabled={!r.date} className={`${input} text-right border-border disabled:opacity-50`} />
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground whitespace-nowrap">
                    {r.date ? `${fmtMeter(hintHm, "HM")} · ${fmtMeter(hintKm, "KM")}` : ""}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <button
                      onClick={() => save(u.ch)}
                      disabled={busy != null || !dirty || !ok}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary text-primary-foreground text-xs font-bold disabled:opacity-50 hover:bg-primary/90 transition-colors"
                    >
                      {busy === u.ch ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      {tx.save}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">{tx.clearHint}</p>
    </div>
  );
}
