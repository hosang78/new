/*
 * 슬기로운 신입생활 — 설정 파일
 * ------------------------------------------------------------
 * 1) API_URL : 구글 시트 Apps Script "웹 앱" 배포 주소(…/exec)를 넣으세요.
 *              비워 두면 '데모 모드'로 동작하고, 답변은 휴대폰에만 저장됩니다.
 * 2) MENUS   : 메인 화면 카드 메뉴. 항목을 추가/삭제하면 바로 반영됩니다.
 *              status: 'open'  → 누르면 href로 이동
 *                      'soon'  → '준비 중' 카드로 표시(누를 수 없음)
 */
window.APP_CONFIG = {
  API_URL: '',

  // 답변 제출 후 AI 반응(시트의 AI반응/AI대사 칸)을 확인하는 주기
  POLL_INTERVAL_MS: 5000,
  POLL_MAX_MINUTES: 30,

  MENUS: [
    {
      id: 'roleplay',
      status: 'open',
      badge: 'AI 상황극',
      title: '슬기로운 신입생활',
      desc: '까다로운 고객, 업무를 맡기는 상사, 협업이 어려운 동료. 세 가지 상황에 직접 답해 보세요.',
      href: 'roleplay.html',
      art: 'trio'
    },
    {
      id: 'soon-1',
      status: 'soon',
      badge: '준비 중',
      title: '새 메뉴가 곧 열려요',
      desc: '다음 교육 콘텐츠가 이 자리에 추가됩니다.'
    },
    {
      id: 'soon-2',
      status: 'soon',
      badge: '준비 중',
      title: '새 메뉴가 곧 열려요',
      desc: '다음 교육 콘텐츠가 이 자리에 추가됩니다.'
    }
  ]
};
