// A small, non-interactive stamp fixed to the bottom of every view showing the
// deployed commit SHA and when it was built/deployed, formatted in the viewer's
// own timezone. It uses pointer-events:none so it never intercepts game input or
// button taps, and is skipped under browser automation (Playwright sets
// navigator.webdriver) so its ever-changing timestamp can't perturb
// screenshot-regression baselines or DOM assertions.

const buildCommitSha = __BUILD_SHA__;
const buildTimestamp = __BUILD_TIME__;

function formatDeployTimestamp(isoTimestamp: string): string {
  const parsed = new Date(isoTimestamp);
  if (Number.isNaN(parsed.getTime())) {
    return isoTimestamp;
  }
  // No explicit timeZone → the browser's own timezone; timeZoneName makes that
  // explicit to the viewer (e.g. "Jul 6, 2026, 11:30 AM PDT").
  return parsed.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export function renderDeployInfoFooter(): void {
  if (typeof document === "undefined" || navigator.webdriver) {
    return;
  }
  if (document.getElementById("deploy-info-footer") !== null) {
    return;
  }

  const footer = document.createElement("div");
  footer.id = "deploy-info-footer";
  footer.style.cssText =
    "position:fixed;right:0;bottom:0;z-index:40;pointer-events:none;" +
    "font:10px/1.4 ui-monospace,monospace;color:#ffffffa6;background:#000000a6;" +
    "padding:2px calc(6px + env(safe-area-inset-right)) " +
    "calc(2px + env(safe-area-inset-bottom)) 6px;" +
    "border-top-left-radius:4px;user-select:none;letter-spacing:0.02em;";

  const shortSha = /^[0-9a-f]{7,}$/i.test(buildCommitSha)
    ? buildCommitSha.slice(0, 7)
    : buildCommitSha;
  footer.textContent = `build ${shortSha} · ${formatDeployTimestamp(buildTimestamp)}`;

  document.body.append(footer);
}

// The game canvas fills the whole window, so the footer would overlap the play
// area (e.g. the ground/enemies in a short landscape window). Hide it while a
// live game is on screen; show it on the menu/editor where there's nothing to
// obscure.
export function setDeployInfoFooterVisible(visible: boolean): void {
  const footer =
    typeof document === "undefined"
      ? null
      : document.getElementById("deploy-info-footer");
  if (footer !== null) {
    footer.style.display = visible ? "" : "none";
  }
}
