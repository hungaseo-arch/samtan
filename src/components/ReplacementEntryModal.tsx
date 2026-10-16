// @section: replacement-entry-modal
// 교체 등록 모달 (지시서 2026-10-16 §A-1).
//
// 점검 입력 탭의 포지션 행 [교체] 버튼에서 열린다. 저장은 RPC register_replacement 한 번 —
// 검증(다른 차량 장착·폐기 타이어·날짜 역전)도 서버가 하고, 여기서는 오류 코드를 문구로 바꾼다.
// 호출부가 canWrite 로 버튼 자체를 숨긴다. RLS 가 최종 방어선.
import { useEffect, useMemo, useState } from "react";
import { X, Loader2, Repeat } from "lucide-react";
import { toast } from "sonner";
import { useLang } from "@/i18n";
import { TMS_DATA } from "@/data/tmsData";
import { todayInField } from "@/lib/format";
import {
  listDamageCodes, registerReplacement, ReplacementEntryError,
  type DamageCodeRow, type ReplacementErrorCode,
} from "@/api/replacements";

const TX = {
  ko: {
    title: "타이어 교체 등록",
    current: "현재 장착",
    date: "교체일",
    newSerial: "신 타이어 시리얼",
    newSerialPh: "예비 타이어 선택 또는 직접 입력",
    spareHint: (n: number) => `예비(Spare) 타이어 ${n}본`,
    reason: "탈착 사유",
    reasonNone: "— 미입력 —",
    oldStatus: "구 타이어 처리",
    scrap: "폐기 (Scrap)",
    spare: "예비 보관 (Spare)",
    rotNote: "로테이션은 구 타이어를 예비로 둡니다. 상대 포지션도 이어서 등록하세요.",
    tread: "탈착 시 트레드 (mm)",
    km: "교체 시 KM",
    hm: "교체 시 HM",
    optional: "선택",
    save: "교체 등록",
    cancel: "취소",
    ok: "교체를 등록했습니다",
    fail: "등록 실패: ",
    err: {
      forbidden: "교체 등록 권한이 없습니다.",
      serial_required: "신 타이어 시리얼을 입력하세요.",
      date_required: "교체일을 입력하세요.",
      bad_old_status: "구 타이어 처리 방법이 올바르지 않습니다.",
      rot_cannot_scrap: "로테이션은 구 타이어를 폐기로 처리할 수 없습니다.",
      bad_reason: "등록되지 않은 사유 코드입니다.",
      position_not_found: "해당 포지션을 찾을 수 없습니다.",
      same_serial: "현재 장착 시리얼과 같습니다.",
      serial_installed: (w: string) => `이 시리얼은 이미 ${w} 에 장착되어 있습니다.`,
      serial_scrapped: "폐기(Scrap) 처리된 타이어입니다.",
      date_before_last: (d: string) => `직전 교체일(${d})보다 앞선 날짜입니다.`,
    },
  },
  id: {
    title: "Pendaftaran Penggantian Ban",
    current: "Terpasang saat ini",
    date: "Tanggal Penggantian",
    newSerial: "Serial ban baru",
    newSerialPh: "Pilih ban cadangan atau ketik langsung",
    spareHint: (n: number) => `${n} ban cadangan (Spare)`,
    reason: "Alasan dilepas",
    reasonNone: "— belum diisi —",
    oldStatus: "Perlakuan ban lama",
    scrap: "Dibuang (Scrap)",
    spare: "Disimpan cadangan (Spare)",
    rotNote: "Rotasi menyimpan ban lama sebagai cadangan. Daftarkan juga Posisi pasangannya.",
    tread: "Kedalaman alur saat dilepas (mm)",
    km: "KM saat Penggantian",
    hm: "HM saat Penggantian",
    optional: "opsional",
    save: "Daftarkan Penggantian",
    cancel: "Batal",
    ok: "Penggantian berhasil didaftarkan",
    fail: "Gagal mendaftar: ",
    err: {
      forbidden: "Anda tidak memiliki izin mendaftarkan Penggantian.",
      serial_required: "Isi serial ban baru.",
      date_required: "Isi tanggal Penggantian.",
      bad_old_status: "Perlakuan ban lama tidak valid.",
      rot_cannot_scrap: "Rotasi tidak dapat membuang ban lama.",
      bad_reason: "Kode alasan tidak terdaftar.",
      position_not_found: "Posisi tidak ditemukan.",
      same_serial: "Sama dengan serial yang terpasang.",
      serial_installed: (w: string) => `Serial ini sudah terpasang di ${w}.`,
      serial_scrapped: "Ban ini sudah dibuang (Scrap).",
      date_before_last: (d: string) => `Tanggal lebih awal dari Penggantian terakhir (${d}).`,
    },
  },
  en: {
    title: "Register Tire Replacement",
    current: "Currently mounted",
    date: "Replacement date",
    newSerial: "New tire serial",
    newSerialPh: "Pick a spare tire or type",
    spareHint: (n: number) => `${n} spare tires`,
    reason: "Removal reason",
    reasonNone: "— not set —",
    oldStatus: "Old tire disposition",
    scrap: "Scrap",
    spare: "Keep as spare",
    rotNote: "Rotation keeps the old tire as a spare. Register the paired position as well.",
    tread: "Tread at removal (mm)",
    km: "KM at replacement",
    hm: "HM at replacement",
    optional: "optional",
    save: "Register",
    cancel: "Cancel",
    ok: "Replacement registered",
    fail: "Registration failed: ",
    err: {
      forbidden: "You are not allowed to register replacements.",
      serial_required: "Enter the new tire serial.",
      date_required: "Enter the replacement date.",
      bad_old_status: "Invalid old tire disposition.",
      rot_cannot_scrap: "A rotation cannot scrap the old tire.",
      bad_reason: "Unknown reason code.",
      position_not_found: "Position not found.",
      same_serial: "Same as the mounted serial.",
      serial_installed: (w: string) => `This serial is already mounted on ${w}.`,
      serial_scrapped: "This tire has been scrapped.",
      date_before_last: (d: string) => `Earlier than the last replacement (${d}).`,
    },
  },
} as const;

type Tx = (typeof TX)[keyof typeof TX];

function errText(tx: Tx, e: unknown): string {
  if (e instanceof ReplacementEntryError && e.code !== "unknown") {
    const m = tx.err[e.code as ReplacementErrorCode];
    return typeof m === "function" ? m(e.detail) : m;
  }
  return tx.fail + (e instanceof Error ? e.message : String(e));
}

const INPUT_CLS = "w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm";

export default function ReplacementEntryModal({
  ch, pos, currentSerial, defaultKm, defaultHm, onClose, onSaved,
}: {
  ch: string;
  pos: string;
  currentSerial: string;
  defaultKm?: string;
  defaultHm?: string;
  onClose: () => void;
  onSaved: (newSerial: string) => void | Promise<void>;
}) {
  const { lang } = useLang();
  const tx = TX[lang];
  const [codes, setCodes] = useState<DamageCodeRow[]>([]);
  const [date, setDate] = useState(todayInField());
  const [serial, setSerial] = useState("");
  const [reason, setReason] = useState("");
  const [oldStatus, setOldStatus] = useState<"Scrap" | "Spare">("Spare");
  const [tread, setTread] = useState("");
  const [km, setKm] = useState(defaultKm ?? "");
  const [hm, setHm] = useState(defaultHm ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listDamageCodes().then(setCodes).catch(() => setCodes([]));
  }, []);

  // 예비 타이어 후보 — 수명 DB 의 Spare. 직접 입력도 허용한다(신품 첫 장착).
  const spares = useMemo(
    () => TMS_DATA.life.filter((l) => l.status === "Spare" && l.serial).map((l) => l.serial).sort(),
    [],
  );
  const isRot = reason === "ROT";
  const num = (v: string) => (v.trim() === "" ? null : Number(v));

  const handleSave = async () => {
    if (!serial.trim()) { toast.error(tx.err.serial_required); return; }
    setBusy(true);
    try {
      await registerReplacement({
        ch, pos, date,
        newSerial: serial,
        reason: reason || null,
        treadAtRemoval: num(tread),
        km: num(km),
        hm: num(hm),
        oldStatus: isRot ? "Spare" : oldStatus,
      });
      toast.success(tx.ok);
      await onSaved(serial.trim());
      onClose();
    } catch (e) {
      toast.error(errText(tx, e));
    } finally {
      setBusy(false);
    }
  };

  const codeLabel = (c: DamageCodeRow) => {
    const d = lang === "ko" ? c.description : (c.description_id ?? c.description);
    return d ? `${c.code} — ${d}` : c.code;
  };

  return (
    <div className="overlay-in fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div
        className="modal-in bg-card border border-border rounded-2xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-base font-bold text-foreground flex items-center gap-2">
              <Repeat className="w-4 h-4 text-primary" /> {tx.title}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5 font-mono">
              CH {ch} · {pos} — {tx.current}: {currentSerial || "—"}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted/50 transition-colors" aria-label={tx.cancel}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <label className="block text-xs space-y-1">
          <span className="font-bold">{tx.date}</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={INPUT_CLS} />
        </label>

        <label className="block text-xs space-y-1">
          <span className="font-bold">{tx.newSerial}</span>
          <input
            type="text"
            list="spare-serials"
            value={serial}
            onChange={(e) => setSerial(e.target.value)}
            placeholder={tx.newSerialPh}
            className={`${INPUT_CLS} font-mono`}
          />
          <datalist id="spare-serials">
            {spares.map((s) => <option key={s} value={s} />)}
          </datalist>
          <span className="text-[11px] text-muted-foreground">{tx.spareHint(spares.length)}</span>
        </label>

        <label className="block text-xs space-y-1">
          <span className="font-bold">{tx.reason}</span>
          <select value={reason} onChange={(e) => setReason(e.target.value)} className={INPUT_CLS}>
            <option value="">{tx.reasonNone}</option>
            {codes.map((c) => <option key={c.code} value={c.code}>{codeLabel(c)}</option>)}
          </select>
        </label>

        <fieldset className="text-xs space-y-1">
          <legend className="font-bold mb-1">{tx.oldStatus}</legend>
          <div className="flex flex-wrap gap-4">
            {(["Spare", "Scrap"] as const).map((s) => (
              <label key={s} className="inline-flex items-center gap-1.5">
                <input
                  type="radio"
                  name="oldStatus"
                  checked={(isRot ? "Spare" : oldStatus) === s}
                  disabled={isRot && s === "Scrap"}
                  onChange={() => setOldStatus(s)}
                />
                {s === "Scrap" ? tx.scrap : tx.spare}
              </label>
            ))}
          </div>
          {isRot && <p className="text-[11px] text-muted-foreground">{tx.rotNote}</p>}
        </fieldset>

        <div className="grid grid-cols-3 gap-2">
          {[
            { label: tx.tread, value: tread, set: setTread, step: "0.1" },
            { label: tx.km, value: km, set: setKm, step: "1" },
            { label: tx.hm, value: hm, set: setHm, step: "0.1" },
          ].map((f) => (
            <label key={f.label} className="block text-xs space-y-1">
              <span className="font-bold">{f.label}</span>
              <input
                type="number"
                inputMode="decimal"
                step={f.step}
                min={0}
                value={f.value}
                onChange={(e) => f.set(e.target.value)}
                placeholder={tx.optional}
                className={`${INPUT_CLS} text-right tabular-nums`}
              />
            </label>
          ))}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg border border-border text-xs font-bold hover:bg-muted/40 transition-colors"
          >
            {tx.cancel}
          </button>
          <button
            onClick={handleSave}
            disabled={busy || !serial.trim()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold disabled:opacity-50 hover:bg-primary/90 transition-colors"
          >
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {tx.save}
          </button>
        </div>
      </div>
    </div>
  );
}
