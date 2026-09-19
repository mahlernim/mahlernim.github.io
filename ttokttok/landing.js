(() => {
  const hasRecordsKey = 'ttokttok.hasRecords';
  const labels = {
    start: '웹에서 시작하기',
    resume: '내 기록 이어보기',
  };

  let hasRecords = false;
  try {
    hasRecords = window.localStorage.getItem(hasRecordsKey) === '1';
  } catch {
    // The landing still works when browser storage is unavailable.
  }

  document.querySelectorAll('[data-web-cta]').forEach((link) => {
    link.textContent = hasRecords ? labels.resume : labels.start;
  });
})();
