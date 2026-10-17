// @section: serial
// 타이어 시리얼 정규화 — 비교·저장은 전부 이 형태로 한다 (decisions M-11, 사용자 결정 2026-10-17).
// 대문자 · 공백 전부 제거. 'da1bfanh 07451d' 와 'DA1BFANH07451D' 가 다른 타이어로 갈라지지 않게 한다.
// prod 2026-10-17 조회: inspections·lifetimes·replacements·vehicle_positions 모두 이미 정규형 → 백필 불필요, 입구 가드 전용.

/** 빈 값은 "" — 호출부가 '시리얼 없음' 으로 판단한다 */
export function normalizeSerial(s: string | null | undefined): string {
  return (s ?? "").toUpperCase().replace(/\s+/g, "");
}

/** 빈 값은 null — DB 의 null 과 같게 취급 */
export function normalizeSerialOrNull(s: string | null | undefined): string | null {
  const v = normalizeSerial(s);
  return v ? v : null;
}
