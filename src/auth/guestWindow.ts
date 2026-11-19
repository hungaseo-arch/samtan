// 게스트 조회 모드 — 2026-11-20 하루 한정.
// 사유: 2026-11-20 사업계획 발표에서 로그인 없이 시스템을 시연하기 위한 임시 개방.
//   ?guest=1 로 접속하고, 아래 시각 이전일 때만 로그인 없이 조회 전용(입력·수정·삭제·다운로드 불가)으로 열린다.
//   만료 후에는 ?guest=1 이 무시되어 기존 로그인 화면으로 돌아간다. 정리 시 이 파일과 사용처를 함께 제거한다.
// 참고: 화면 차단만 푸는 것이며 DB 정책은 바꾸지 않는다(조회는 원래 anon 허용, 쓰기는 authenticated 전용).
export const GUEST_EXPIRES_AT = Date.parse("2026-11-20T23:59:59+07:00");

export function isGuestWindow(now: number = Date.now(), search: string = window.location.search): boolean {
  return now <= GUEST_EXPIRES_AT && new URLSearchParams(search).get("guest") === "1";
}
