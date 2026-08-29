document.addEventListener("DOMContentLoaded", () => {
  const button = document.querySelector(".email-copy");
  if (!button) return;

  const status = document.getElementById("email-copy-status");
  const originalLabel = button.textContent;
  let resetTimer;

  button.addEventListener("click", async () => {
    const address = `${button.dataset.user}@${button.dataset.domain}`;
    try {
      if (!navigator.clipboard || !window.isSecureContext) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(address);
      button.textContent = "복사됨";
      if (status) status.textContent = "이메일 주소를 복사했습니다.";
      window.clearTimeout(resetTimer);
      resetTimer = window.setTimeout(() => {
        button.textContent = originalLabel;
        if (status) status.textContent = "";
      }, 1800);
    } catch (_error) {
      window.prompt("이메일 주소를 복사하세요.", address);
      if (status) status.textContent = "이메일 주소를 직접 복사할 수 있는 창을 열었습니다.";
    }
  });
});
