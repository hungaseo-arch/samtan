// @section: admin-settings-panel
// 관리자 페이지 › 판정 기준 (지시서 2026-10-16 §A-5).
//
// tire_config 1행을 고치는 화면이다. 처음 값은 지금 TMS_DATA 에 적용 중인 값(접근자 경유,
// DB 가 비어 있으면 폴백)으로 채운다. 저장하면 onSaved 가 loadData() 를 다시 돌려
// 모든 탭의 신호등이 새 기준으로 바뀐다.
//
// 비율 3개(저압 경계·주의 편차·위험 편차)는 DB 에 0~1 소수로 들어가지만 화면은 % 로 받는다.
import { useMemo, useState } from "react";
import { Loader2, Save, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useLang } from "@/i18n";
import {
  treadThresholds, recPsi, pressureThresholds, inspectionIntervalDays, targetLifeKm,
} from "@/data/tmsData";
import { updateJudgeConfig, validateJudgeConfig, type JudgeConfig } from "@/api/config";

const TX = {
  ko: {
    head: "판정 기준",
    desc: "모든 탭의 신호등·경보가 이 값으로 판정됩니다. 저장하면 즉시 전체 화면에 반영됩니다.",
    gTread: "트레드 신호등 (mm, 미만 판정)",
    gPsi: "권장 공기압 (psi)",
    gPsiJudge: "공기압 판정 (%)",
    gOps: "운영 기준",
    tread_critical: "적색 위험 — 즉시 교체",
    tread_order: "주황 발주 — 교체 타이어 발주",
    tread_caution: "황색 주의 — 교체 예정 등재",
    rec_psi_steer: "조향축 (L1·R1)",
    rec_psi_drive: "구동축 (그 외 8본)",
    psi_low_ratio: "저압 위험 — 권장의 이 % 미만",
    psi_dev_warn: "정상 허용 편차 ±%",
    psi_dev_danger: "과압 위험 — 권장 대비 +% 초과",
    inspection_interval_days: "점검 보고 주기 (일)",
    target_life_km: "목표 수명 (km)",
    hintInterval: "경과일이 주기의 1.5배를 넘으면 점검 지연으로 표시합니다.",
    save: "저장", reset: "되돌리기",
    saved: "판정 기준을 저장했습니다", saveFail: "저장 실패: ",
    invalid: "값을 확인하세요 — 위험 < 발주 < 주의, 주의 편차 < 위험 편차 순이어야 합니다.",
    confirm: "판정 기준을 변경하시겠습니까?\n모든 사용자의 신호등·경보가 바뀝니다.",
  },
  id: {
    head: "Kriteria Penilaian",
    desc: "Semua indikator dan peringatan di setiap tab dinilai dengan nilai ini. Setelah disimpan, langsung berlaku di semua layar.",
    gTread: "Indikator kedalaman alur (mm, kurang dari)",
    gPsi: "Tekanan angin standar (psi)",
    gPsiJudge: "Penilaian tekanan angin (%)",
    gOps: "Standar operasional",
    tread_critical: "Merah bahaya — ganti segera",
    tread_order: "Oranye pesan — pesan ban pengganti",
    tread_caution: "Kuning waspada — masuk daftar penggantian",
    rec_psi_steer: "Sumbu kemudi (L1·R1)",
    rec_psi_drive: "Sumbu penggerak (8 ban lainnya)",
    psi_low_ratio: "Bahaya kurang angin — di bawah % standar ini",
    psi_dev_warn: "Toleransi normal ±%",
    psi_dev_danger: "Bahaya kelebihan angin — lebih dari +% standar",
    inspection_interval_days: "Siklus laporan Pemeriksaan (hari)",
    target_life_km: "Target umur ban (km)",
    hintInterval: "Jika selang hari melebihi 1,5 kali siklus, ditandai Pemeriksaan terlambat.",
    save: "Simpan", reset: "Kembalikan",
    saved: "Kriteria penilaian disimpan", saveFail: "Gagal menyimpan: ",
    invalid: "Periksa nilai — harus bahaya < pesan < waspada, dan toleransi < batas bahaya.",
    confirm: "Ubah kriteria penilaian?\nIndikator dan peringatan semua pengguna akan berubah.",
  },
  en: {
    head: "Judgement Criteria",
    desc: "Every indicator and alert in all tabs is judged with these values. Saving applies them to every screen immediately.",
    gTread: "Tread indicator (mm, below)",
    gPsi: "Recommended pressure (psi)",
    gPsiJudge: "Pressure judgement (%)",
    gOps: "Operations",
    tread_critical: "Red danger — replace now",
    tread_order: "Orange order — order replacement tire",
    tread_caution: "Yellow caution — add to replacement list",
    rec_psi_steer: "Steer axle (L1·R1)",
    rec_psi_drive: "Drive axles (other 8)",
    psi_low_ratio: "Under-inflation danger — below this % of recommended",
    psi_dev_warn: "Normal tolerance ±%",
    psi_dev_danger: "Over-inflation danger — above +% of recommended",
    inspection_interval_days: "Inspection report interval (days)",
    target_life_km: "Target tire life (km)",
    hintInterval: "Marked as overdue when days since the last inspection exceed 1.5× the interval.",
    save: "Save", reset: "Revert",
    saved: "Criteria saved", saveFail: "Save failed: ",
    invalid: "Check the values — danger < order < caution, and tolerance < danger deviation.",
    confirm: "Change the judgement criteria?\nIndicators and alerts change for every user.",
  },
} as const;

/** 화면에서 % 로 받는 비율 키 */
const PCT_KEYS = new Set<keyof JudgeConfig>(["psi_low_ratio", "psi_dev_warn", "psi_dev_danger"]);

const GROUPS: { title: "gTread" | "gPsi" | "gPsiJudge" | "gOps"; keys: (keyof JudgeConfig)[] }[] = [
  { title: "gTread", keys: ["tread_critical", "tread_order", "tread_caution"] },
  { title: "gPsi", keys: ["rec_psi_steer", "rec_psi_drive"] },
  { title: "gPsiJudge", keys: ["psi_low_ratio", "psi_dev_warn", "psi_dev_danger"] },
  { title: "gOps", keys: ["inspection_interval_days", "target_life_km"] },
];

type Draft = Record<keyof JudgeConfig, string>;

/** 지금 적용 중인 값 → 입력칸 문자열. 비율은 % 로 바꾸고 부동소수 잡음을 0.1 단위로 정리한다. */
function currentDraft(): Draft {
  const t = treadThresholds();
  const p = pressureThresholds();
  const pct = (r: number) => String(Math.round(r * 1000) / 10);
  return {
    tread_critical: String(t.critical),
    tread_order: String(t.order),
    tread_caution: String(t.caution),
    rec_psi_steer: String(recPsi(1)),
    rec_psi_drive: String(recPsi(3)),
    psi_low_ratio: pct(p.lowRatio),
    psi_dev_warn: pct(p.devWarn),
    psi_dev_danger: pct(p.devDanger),
    inspection_interval_days: String(inspectionIntervalDays()),
    target_life_km: String(targetLifeKm()),
  };
}

function toConfig(d: Draft): JudgeConfig {
  const out = {} as JudgeConfig;
  for (const k of Object.keys(d) as (keyof JudgeConfig)[]) {
    const n = d[k].trim() === "" ? NaN : Number(d[k]);
    out[k] = PCT_KEYS.has(k) ? Math.round(n * 10) / 1000 : n;
  }
  return out;
}

export default function SettingsPanel({ onSaved }: { onSaved?: () => void | Promise<void> }) {
  const { lang } = useLang();
  const tx = TX[lang];
  const [initial, setInitial] = useState<Draft>(currentDraft);
  const [draft, setDraft] = useState<Draft>(initial);
  const [busy, setBusy] = useState(false);

  const bad = useMemo(() => new Set(validateJudgeConfig(toConfig(draft))), [draft]);
  const dirty = (Object.keys(draft) as (keyof JudgeConfig)[]).some((k) => draft[k] !== initial[k]);

  const handleSave = async () => {
    if (bad.size > 0) { toast.error(tx.invalid); return; }
    if (!window.confirm(tx.confirm)) return;
    setBusy(true);
    try {
      await updateJudgeConfig(toConfig(draft));
      await onSaved?.();
      // 다시 읽은 TMS_DATA 기준으로 화면을 맞춘다 (DB 가 값을 바꿨을 가능성까지 반영)
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

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
      <div>
        <h3 className="text-sm font-bold">{tx.head}</h3>
        <p className="text-xs text-muted-foreground">{tx.desc}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {GROUPS.map((g) => (
          <fieldset key={g.title} className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
            <legend className="px-1 text-xs font-bold">{tx[g.title]}</legend>
            {g.keys.map((k) => (
              <label key={k} className="flex items-center justify-between gap-3 text-xs">
                <span className="min-w-0">{tx[k]}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step={k === "inspection_interval_days" || k === "target_life_km" ? 1 : 0.1}
                  value={draft[k]}
                  onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
                  aria-invalid={bad.has(k)}
                  className={`w-28 shrink-0 rounded-lg border bg-background px-2 py-1.5 text-sm text-right tabular-nums ${
                    bad.has(k) ? "border-destructive" : "border-border"
                  }`}
                />
              </label>
            ))}
            {g.title === "gOps" && (
              <p className="text-[11px] text-muted-foreground">{tx.hintInterval}</p>
            )}
          </fieldset>
        ))}
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
