const copyButton = document.querySelector("[data-copy-link]");
const printButton = document.querySelector("[data-print]");
const copyStatus = document.querySelector("[data-copy-status]");

copyButton?.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(window.location.href);
    showCopyStatus(document.documentElement.lang === "en" ? "Link copied" : "链接已复制");
  } catch {
    showCopyStatus(document.documentElement.lang === "en" ? "Copy failed" : "复制失败");
  }
});

printButton?.addEventListener("click", () => window.print());

function showCopyStatus(message) {
  if (!copyStatus) return;
  copyStatus.textContent = message;
  copyStatus.classList.add("is-visible");
  window.setTimeout(() => copyStatus.classList.remove("is-visible"), 1_800);
}
