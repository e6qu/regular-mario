// A reusable spotlight walkthrough: it dims the screen, cuts a hole over each
// target element in turn, and floats a titled tip beside it with Skip / Back /
// Next controls. Shared by the level editor and the start menu so the two
// tutorials look and behave identically (and aren't duplicated). The dimmed UI
// underneath stays fully interactive — only the tip's own buttons capture input.

export type WalkthroughStep = {
  readonly target: HTMLElement;
  readonly title: string;
  readonly body: string;
};

export type WalkthroughOptions = {
  // Accessible name for the tip dialog.
  readonly ariaLabel: string;
  // Runs once when the walkthrough is finished or skipped (e.g. persist "seen").
  readonly onFinish?: () => void;
  // Keep the tip clear of chrome at the very top of the page (e.g. a tab bar).
  readonly tipMinTopPixels?: number;
};

// Start a walkthrough over `steps`, attaching its overlay to `container` (so it
// tears down when the container is removed — e.g. leaving into a play-test).
export function runSpotlightWalkthrough(
  container: HTMLElement,
  steps: readonly WalkthroughStep[],
  options: WalkthroughOptions,
): void {
  const tipMinTopPixels = options.tipMinTopPixels ?? 56;
  const spotlight = document.createElement("div");
  spotlight.setAttribute("aria-hidden", "true");
  spotlight.style.cssText =
    "position:fixed;z-index:99998;border:3px solid #38bdf8;border-radius:10px;" +
    "box-shadow:0 0 0 9999px rgba(2,6,23,0.7);pointer-events:none;transition:all 0.2s ease;";
  const tip = document.createElement("div");
  tip.setAttribute("role", "dialog");
  tip.setAttribute("aria-label", options.ariaLabel);
  tip.style.cssText =
    "position:fixed;z-index:99999;max-width:340px;background:#0b1220;color:#f8fafc;" +
    "border:2px solid #38bdf8;border-radius:12px;padding:16px 18px;font:14px/1.55 monospace;" +
    "box-shadow:0 10px 30px rgba(0,0,0,0.5);pointer-events:none;";
  const finish = (): void => {
    options.onFinish?.();
    spotlight.remove();
    tip.remove();
    window.removeEventListener("resize", show);
    window.removeEventListener("keydown", onKeyDown);
  };
  // Escape leaves, as it does everywhere else in the product. The tip declares
  // itself a dialog and offered no keyboard way out.
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      finish();
    }
  };
  window.addEventListener("keydown", onKeyDown);
  let index = 0;
  function show(): void {
    const step = steps[index];
    if (step === undefined) {
      finish();
      return;
    }
    step.target.scrollIntoView({ block: "center", inline: "nearest" });
    const rect = step.target.getBoundingClientRect();
    spotlight.style.left = `${String(rect.left - 6)}px`;
    spotlight.style.top = `${String(rect.top - 6)}px`;
    spotlight.style.width = `${String(rect.width + 12)}px`;
    spotlight.style.height = `${String(rect.height + 12)}px`;
    // Put the tip where it does not cover the thing it is describing — or, on
    // a screen with no room for that, where it covers the least.
    //
    // It used to go below the target and flip above when the bottom ran out,
    // with nothing stopping either position from landing on top of the panel
    // it was pointing at. On a short landscape screen the card came down over
    // the menu's own buttons, and because its controls take pointer events the
    // primary action underneath became unclickable — including through a
    // disabled Back button, which blocks a click without doing anything.
    const gapPixels = 12;
    const tipWidthPixels = 340;
    const tipHeightPixels = 176;
    const fitsHorizontally = (left: number): boolean =>
      left >= gapPixels &&
      left + tipWidthPixels <= window.innerWidth - gapPixels;
    const fitsVertically = (top: number): boolean =>
      top >= tipMinTopPixels &&
      top + tipHeightPixels <= window.innerHeight - gapPixels;
    const alignedLeft = Math.max(
      gapPixels,
      Math.min(rect.left, window.innerWidth - tipWidthPixels - gapPixels),
    );
    const verticallyCentred = Math.max(
      tipMinTopPixels,
      Math.min(
        rect.top + rect.height / 2 - tipHeightPixels / 2,
        window.innerHeight - tipHeightPixels - gapPixels,
      ),
    );
    const placements: readonly { left: number; top: number }[] = [
      // Below, then above: the natural reading positions.
      { left: alignedLeft, top: rect.bottom + gapPixels },
      { left: alignedLeft, top: rect.top - tipHeightPixels - gapPixels },
      // Beside: on a short screen this is the only place that leaves the
      // highlighted control reachable.
      { left: rect.right + gapPixels, top: verticallyCentred },
      { left: rect.left - tipWidthPixels - gapPixels, top: verticallyCentred },
    ];
    const placement =
      placements.find(
        (candidate) =>
          fitsHorizontally(candidate.left) && fitsVertically(candidate.top),
      ) ?? placements[0]!;
    tip.style.left = `${String(Math.max(gapPixels, placement.left))}px`;
    tip.style.top = `${String(Math.max(tipMinTopPixels, placement.top))}px`;
    tip.replaceChildren();
    const heading = document.createElement("div");
    heading.textContent = step.title;
    heading.style.cssText =
      "font-weight:800;color:#38bdf8;margin-bottom:6px;letter-spacing:0.5px;";
    const body = document.createElement("div");
    body.textContent = step.body;
    const controls = document.createElement("div");
    controls.style.cssText =
      "display:flex;gap:8px;justify-content:flex-end;margin-top:14px;";
    const skip = document.createElement("button");
    skip.textContent = "Skip";
    skip.style.cssText =
      "padding:7px 12px;border-radius:7px;border:1px solid #475569;background:transparent;color:#cbd5e1;font:600 12px monospace;cursor:pointer;margin-right:auto;pointer-events:auto;";
    skip.addEventListener("click", finish);
    const back = document.createElement("button");
    back.textContent = "Back";
    back.style.cssText =
      "padding:7px 12px;border-radius:7px;border:1px solid #475569;background:#1e293b;color:#e5e7eb;font:600 12px monospace;cursor:pointer;pointer-events:auto;";
    back.disabled = index === 0;
    back.style.opacity = index === 0 ? "0.4" : "1";
    // A disabled button still sits in front of whatever is beneath it and
    // swallows the click. Nothing about it is interactive, so it should not be
    // in the way either.
    back.style.pointerEvents = index === 0 ? "none" : "auto";
    back.addEventListener("click", () => {
      index = Math.max(0, index - 1);
      show();
    });
    const next = document.createElement("button");
    next.textContent = index === steps.length - 1 ? "Done" : "Next";
    next.style.cssText =
      "padding:7px 14px;border-radius:7px;border:none;background:#0f766e;color:#fff;font:700 12px monospace;cursor:pointer;pointer-events:auto;";
    next.addEventListener("click", () => {
      index += 1;
      show();
    });
    controls.append(skip, back, next);
    tip.append(heading, body, controls);
  }
  window.addEventListener("resize", show);
  container.append(spotlight, tip);
  show();
}
