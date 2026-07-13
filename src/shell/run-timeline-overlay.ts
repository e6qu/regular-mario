// A screen-space (DOM) timeline scrubber shown while the run is paused. It sits
// over the game canvas — deliberately not a Phaser object, so the camera zoom
// never distorts it and we get native hover/click handling and styling.

export type RunTimelineThumbnail = {
  readonly frame: number;
  readonly imageDataUrl: string;
};

export type RunTimelineCallbacks = {
  // Seek to an absolute frame (already clamped by the caller's data).
  readonly onSeek: (frame: number) => void;
  // Toggle playing the recorded run back (video-editor transport).
  readonly onTogglePlay: () => void;
  // Resume live play from the paused frame.
  readonly onResume: () => void;
  // Restart the level.
  readonly onRetry: () => void;
  // Advance to the next level (offered only after finishing, when one exists).
  readonly onContinue?: () => void;
  // Return to the start menu to pick/upload/edit another level (optional).
  readonly onExitToMenu?: () => void;
  // Label for that exit button (defaults to "☰ Menu").
  readonly exitLabel?: string;
  // Download the run as a replay log (no screenshots) or a full zip.
  readonly onExportLog: () => void;
  readonly onExportZip: () => void;
};

// Step sizes offered as buttons, in frames (≈ 1 frame, 0.1s, 1s, 5s at 60fps).
const timelineStepSizes = [1, 6, 60, 300] as const;

function formatFrameTime(frame: number, frameDurationMs: number): string {
  const totalSeconds = (frame * frameDurationMs) / 1000;
  return `${totalSeconds.toFixed(2)}s`;
}

// Remember whether the scrubber filmstrip is collapsed. Default (no stored
// value) is expanded — the timeline is on unless the player turns it off.
const timelineCollapsedStorageKey = "regular-mario:timeline-collapsed";

function readTimelineCollapsed(): boolean {
  try {
    return globalThis.localStorage.getItem(timelineCollapsedStorageKey) === "1";
  } catch {
    return false;
  }
}

function writeTimelineCollapsed(collapsed: boolean): void {
  try {
    globalThis.localStorage.setItem(
      timelineCollapsedStorageKey,
      collapsed ? "1" : "0",
    );
  } catch {
    // Storage may be unavailable (private mode); the toggle still works in-session.
  }
}

// Keyframes + classes for the level-complete glisten/pulse. Scoped to elements
// inside the overlay; honours prefers-reduced-motion.
function makeTimelineOverlayStyle(): HTMLStyleElement {
  const style = document.createElement("style");
  style.textContent = `
@keyframes tl-shine { to { background-position: 200% center; } }
@keyframes tl-pulse {
  0%, 100% { box-shadow: 0 0 0 0 #ffd54a44; }
  50% { box-shadow: 0 0 22px 5px #ffd54abb; }
}
.tl-glisten {
  background-image: linear-gradient(110deg,#c9760a 0%,#ffd54a 42%,#fff6cf 50%,#ffd54a 58%,#c9760a 100%);
  background-size: 220% auto;
  color: #3a2400 !important;
  animation: tl-shine 1.8s linear infinite, tl-pulse 1.8s ease-in-out infinite;
}
.tl-glisten-text {
  background-image: linear-gradient(110deg,#ffd54a 0%,#fffbe6 45%,#ffffff 50%,#fffbe6 55%,#ffd54a 100%);
  background-size: 220% auto;
  -webkit-background-clip: text; background-clip: text; color: transparent;
  animation: tl-shine 1.8s linear infinite;
  text-shadow: 0 0 12px #ffd54a55;
}
.tl-press-n { color: #fde68a; font-size: 14px; font-weight: 700; letter-spacing: 0.4px; }
.tl-press-n kbd {
  display: inline-block; min-width: 1.4em; text-align: center; margin: 0 3px;
  background: #fde68a; color: #3a2400; border-radius: 4px; padding: 1px 7px;
  font-weight: 800; box-shadow: 0 2px 0 #a16207;
}
@media (prefers-reduced-motion: reduce) {
  .tl-glisten, .tl-glisten-text { animation: none; }
}
/* Short-viewport (mobile-landscape) compaction so the end-of-run replay bar
   fits without covering the whole screen: smaller padding, a shorter filmstrip,
   and a smaller complete banner. */
@media (max-height: 540px) {
  .tl-overlay { padding: 6px 10px 8px !important; }
  .tl-overlay .tl-heading { margin-bottom: 4px !important; gap: 6px !important; }
  .tl-overlay .tl-track { height: 52px !important; }
  .tl-overlay .tl-complete-banner { font-size: 14px !important; margin: 1px 0 5px !important; gap: 8px !important; }
  .tl-overlay .tl-press-n { font-size: 11px !important; }
  .tl-overlay button { padding: 4px 7px !important; font-size: 11px !important; }
  /* The control buttons don't fit in one row on a narrow phone; let them wrap
     to their own full-width rows (so Retry/Menu stay reachable) rather than
     overflowing off-screen. */
  .tl-overlay .tl-controls { margin-left: 0 !important; width: 100%; gap: 5px !important; justify-content: flex-start; }
}
`;
  return style;
}

export class RunTimelineOverlay {
  private readonly root: HTMLDivElement;
  private readonly track: HTMLDivElement;
  private readonly strip: HTMLDivElement;
  private readonly playhead: HTMLDivElement;
  private readonly tooltip: HTMLDivElement;
  private readonly frameLabel: HTMLSpanElement;
  private readonly title: HTMLSpanElement;
  private readonly completeBanner: HTMLDivElement;
  private playButton!: HTMLButtonElement;
  private continueButton!: HTMLButtonElement;
  private readonly timelineToggleButton: HTMLButtonElement;
  // Whether the filmstrip/scrubber track is collapsed (controls stay). Defaults
  // to expanded ("timeline on") and is remembered across runs.
  private timelineCollapsed = readTimelineCollapsed();

  // Shared base so the normal and level-complete bar styles differ only in their
  // background/border/glow, not in layout.
  // Centred, inset panel rather than a full-bleed bar: capped to a max width and
  // horizontally centred (left/right:0 + margin:auto) so it no longer spans the
  // whole play area — the game stays visible on either side of it. Insets by a
  // little on narrow viewports.
  private static readonly rootBaseCss =
    "position:absolute;left:0;right:0;bottom:0;margin:0 auto;" +
    "width:100%;max-width:min(560px,calc(100% - 24px));" +
    "z-index:20;display:none;" +
    "padding:12px 16px 16px;box-sizing:border-box;" +
    "backdrop-filter:blur(2px);font-family:monospace;user-select:none;";
  private pauseFrame = 0;
  private currentFrame = 0;
  private frameDurationMs = 1000 / 60;

  public constructor(
    parent: HTMLElement,
    private readonly callbacks: RunTimelineCallbacks,
  ) {
    this.root = document.createElement("div");
    this.root.classList.add("tl-overlay");
    this.applyRootStyle();
    this.root.append(makeTimelineOverlayStyle());

    const heading = document.createElement("div");
    heading.classList.add("tl-heading");
    heading.style.cssText =
      "display:flex;align-items:center;gap:12px;margin-bottom:8px;font:600 13px/1.2 monospace;color:#e5e7eb;flex-wrap:wrap;";
    this.title = document.createElement("span");
    this.title.textContent = "PAUSED";
    this.title.style.cssText =
      "letter-spacing:2px;color:#fbbf24;background:#00000055;padding:2px 8px;border-radius:4px;";
    this.frameLabel = document.createElement("span");
    this.frameLabel.style.color = "#9ca3af";
    this.timelineToggleButton = this.makeTimelineToggle();
    heading.append(
      this.title,
      this.frameLabel,
      this.timelineToggleButton,
      this.makeControls(),
    );
    this.root.append(heading);

    // A celebratory, glistening banner shown only on a level-complete pause,
    // making the end-of-level bar prominent and advertising the N shortcut.
    this.completeBanner = document.createElement("div");
    this.completeBanner.classList.add("tl-complete-banner");
    this.completeBanner.style.cssText =
      "display:none;align-items:center;gap:14px;margin:2px 0 10px;flex-wrap:wrap;" +
      "font:800 20px/1.2 monospace;letter-spacing:1px;";
    this.completeBanner.innerHTML =
      '<span class="tl-glisten-text">✦ LEVEL COMPLETE ✦</span>' +
      '<span class="tl-press-n">Press <kbd>N</kbd> for next level ▶</span>';
    this.root.append(this.completeBanner);

    this.track = document.createElement("div");
    this.track.classList.add("tl-track");
    this.track.style.cssText =
      "position:relative;height:84px;border-radius:6px;overflow:hidden;cursor:pointer;background:#0b0f19;border:1px solid #374151;";

    // A filmstrip of distinct, fixed-aspect frame thumbnails placed by time.
    this.strip = document.createElement("div");
    this.strip.style.cssText =
      "position:absolute;inset:0;overflow:hidden;pointer-events:none;";
    this.playhead = document.createElement("div");
    this.playhead.style.cssText =
      "position:absolute;top:0;bottom:0;width:2px;background:#fbbf24;box-shadow:0 0 6px #fbbf24;pointer-events:none;";
    this.tooltip = document.createElement("div");
    this.tooltip.style.cssText =
      "position:absolute;top:-30px;transform:translateX(-50%);padding:2px 6px;border-radius:4px;background:#000000cc;color:#fff;font:11px/1.2 monospace;white-space:nowrap;pointer-events:none;display:none;";

    this.track.append(this.strip, this.playhead, this.tooltip);
    this.root.append(this.track);
    this.applyTimelineCollapsed();
    this.registerTrackHandlers();

    parent.append(this.root);
  }

  public show(
    pauseFrame: number,
    currentFrame: number,
    thumbnails: readonly RunTimelineThumbnail[],
    frameDurationMs: number,
    canContinue = false,
  ): void {
    this.pauseFrame = Math.max(1, pauseFrame);
    this.frameDurationMs = frameDurationMs;
    // Offer "Next level" only when this pause is a finish with a level to go to.
    const offerContinue =
      canContinue && this.callbacks.onContinue !== undefined;
    this.applyLevelCompleteProminence(offerContinue);
    this.continueButton.style.display = offerContinue ? "" : "none";
    // Lay the track out first so renderThumbnails can measure its width.
    this.root.style.display = "block";
    this.renderThumbnails(thumbnails);
    this.setCurrentFrame(currentFrame);
  }

  // On a level-complete pause, promote the whole bar: a gold-bordered glowing
  // background, a glistening "LEVEL COMPLETE / Press N" banner, and a bigger,
  // shimmering "Next level" button. A normal (mid-run or death) pause reverts.
  private applyLevelCompleteProminence(offerContinue: boolean): void {
    this.completeBanner.style.display = offerContinue ? "flex" : "none";
    this.title.textContent = offerContinue ? "✓ FINISHED" : "PAUSED";
    this.title.style.color = offerContinue ? "#3a2400" : "#fbbf24";
    this.title.style.background = offerContinue ? "#ffd54a" : "#00000055";
    if (offerContinue) {
      this.continueButton.classList.add("tl-glisten");
      this.continueButton.style.padding = "9px 18px";
      this.continueButton.style.font = "800 15px/1 monospace";
      this.applyProminentRootStyle();
    } else {
      this.continueButton.classList.remove("tl-glisten");
      this.continueButton.style.padding = "4px 9px";
      this.continueButton.style.font = "600 12px/1 monospace";
      this.applyRootStyle();
    }
  }

  public setCurrentFrame(frame: number): void {
    this.currentFrame = Math.max(0, Math.min(frame, this.pauseFrame));
    const ratio = this.currentFrame / this.pauseFrame;
    this.playhead.style.left = `${(ratio * 100).toFixed(3)}%`;
    this.frameLabel.textContent = `frame ${this.currentFrame} / ${this.pauseFrame} · ${formatFrameTime(this.currentFrame, this.frameDurationMs)}`;
  }

  public setPlaying(playing: boolean): void {
    this.playButton.textContent = playing ? "⏸ Pause" : "▶ Play";
  }

  public hide(): void {
    this.root.style.display = "none";
    this.tooltip.style.display = "none";
  }

  public destroy(): void {
    this.root.remove();
  }

  private applyRootStyle(): void {
    this.root.style.cssText =
      RunTimelineOverlay.rootBaseCss +
      "background:linear-gradient(180deg,#0b0f19cc,#0b0f19ee);" +
      "border:1px solid #374151;border-bottom:none;border-radius:8px 8px 0 0;";
  }

  private applyProminentRootStyle(): void {
    this.root.style.cssText =
      RunTimelineOverlay.rootBaseCss +
      "background:linear-gradient(180deg,#1c1407f2,#0b0f19f5);" +
      "border:1px solid #ffd54a;border-top-width:4px;border-bottom:none;" +
      "border-radius:8px 8px 0 0;box-shadow:0 -10px 34px #ffd54a2e;";
  }

  // A small toggle that collapses/expands the filmstrip scrubber (the "timeline"
  // proper). The control buttons stay either way; the choice is remembered.
  private makeTimelineToggle(): HTMLButtonElement {
    return this.makeActionButton("", "#4b5563", () => {
      this.timelineCollapsed = !this.timelineCollapsed;
      writeTimelineCollapsed(this.timelineCollapsed);
      this.applyTimelineCollapsed();
    });
  }

  private applyTimelineCollapsed(): void {
    this.track.style.display = this.timelineCollapsed ? "none" : "";
    this.timelineToggleButton.textContent = this.timelineCollapsed
      ? "▸ Timeline"
      : "▾ Timeline";
  }

  private makeControls(): HTMLDivElement {
    const controls = document.createElement("div");
    controls.classList.add("tl-controls");
    controls.style.cssText =
      "display:flex;align-items:center;gap:6px;margin-left:auto;flex-wrap:wrap;";

    this.playButton = this.makeActionButton("▶ Play", "#16a34a", () =>
      this.callbacks.onTogglePlay(),
    );
    controls.append(this.playButton);

    for (const size of timelineStepSizes) {
      controls.append(this.makeStepButton(-size, `-${size}`));
    }
    for (const size of [...timelineStepSizes].reverse()) {
      controls.append(this.makeStepButton(size, `+${size}`));
    }

    controls.append(
      this.makeActionButton("Export .json", "#4b5563", () =>
        this.callbacks.onExportLog(),
      ),
      this.makeActionButton("Export .zip", "#4b5563", () =>
        this.callbacks.onExportZip(),
      ),
      this.makeActionButton("Resume", "#16a34a", () =>
        this.callbacks.onResume(),
      ),
      this.makeActionButton("Retry", "#2563eb", () => this.callbacks.onRetry()),
    );
    // Shown only after finishing a level that has a next one (toggled in show()).
    this.continueButton = this.makeActionButton("Next level ▶", "#ea9010", () =>
      this.callbacks.onContinue?.(),
    );
    this.continueButton.style.display = "none";
    controls.append(this.continueButton);
    if (this.callbacks.onExitToMenu !== undefined) {
      controls.append(
        this.makeActionButton(
          this.callbacks.exitLabel ?? "☰ Menu",
          "#7c3aed",
          () => this.callbacks.onExitToMenu?.(),
        ),
      );
    }
    return controls;
  }

  private makeStepButton(delta: number, label: string): HTMLButtonElement {
    return this.makeActionButton(label, "#374151", () => {
      this.callbacks.onSeek(this.currentFrame + delta);
    });
  }

  private makeActionButton(
    label: string,
    background: string,
    onClick: () => void,
  ): HTMLButtonElement {
    const button = document.createElement("button");
    button.textContent = label;
    button.style.cssText =
      `background:${background};color:#fff;border:none;border-radius:4px;` +
      "padding:4px 9px;font:600 12px/1 monospace;cursor:pointer;";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      onClick();
    });
    return button;
  }

  private renderThumbnails(thumbnails: readonly RunTimelineThumbnail[]): void {
    this.strip.replaceChildren();
    if (thumbnails.length === 0) {
      return;
    }

    // Each thumbnail is a fixed 16:9 frame placed at its moment along the track,
    // so short and long runs both read as a clean filmstrip (no letterboxing
    // from variable-width cells). If more frames were captured than fit, sample
    // them evenly across the run.
    const trackWidth = this.track.clientWidth || window.innerWidth;
    const thumbWidth = Math.round((this.track.clientHeight || 84) * (16 / 9));
    const capacity = Math.max(1, Math.floor(trackWidth / (thumbWidth + 2)));
    const sampled = this.sampleThumbnails(thumbnails, capacity);
    const travel = Math.max(0, trackWidth - thumbWidth);

    for (const thumbnail of sampled) {
      const image = document.createElement("img");
      image.src = thumbnail.imageDataUrl;
      const left = (thumbnail.frame / this.pauseFrame) * travel;
      image.style.cssText =
        `position:absolute;top:0;height:100%;width:${thumbWidth}px;left:${left.toFixed(1)}px;` +
        "object-fit:cover;image-rendering:pixelated;border-radius:2px;box-shadow:0 0 0 1px #ffffff20;";
      this.strip.append(image);
    }
  }

  // Pick at most `count` thumbnails, evenly spaced across the captured set.
  private sampleThumbnails(
    thumbnails: readonly RunTimelineThumbnail[],
    count: number,
  ): RunTimelineThumbnail[] {
    if (thumbnails.length <= count) {
      return [...thumbnails];
    }
    const picked: RunTimelineThumbnail[] = [];
    // Math.max(1, …) avoids a 0/0 = NaN when only one cell fits (count === 1),
    // which would otherwise drop every thumbnail on a narrow/phone-width track.
    for (let index = 0; index < count; index += 1) {
      const source = Math.round(
        (index * (thumbnails.length - 1)) / Math.max(1, count - 1),
      );
      const thumbnail = thumbnails[source];
      if (thumbnail !== undefined) {
        picked.push(thumbnail);
      }
    }
    return picked;
  }

  private frameForClientX(clientX: number): number {
    const bounds = this.track.getBoundingClientRect();
    const ratio = Math.max(
      0,
      Math.min(1, (clientX - bounds.left) / bounds.width),
    );
    return Math.round(ratio * this.pauseFrame);
  }

  private registerTrackHandlers(): void {
    const seekTo = (clientX: number): void => {
      this.callbacks.onSeek(this.frameForClientX(clientX));
    };

    let dragging = false;
    this.track.addEventListener("pointerdown", (event) => {
      dragging = true;
      this.track.setPointerCapture(event.pointerId);
      seekTo(event.clientX);
    });
    this.track.addEventListener("pointerup", () => {
      dragging = false;
    });
    this.track.addEventListener("pointermove", (event) => {
      const frame = this.frameForClientX(event.clientX);
      const bounds = this.track.getBoundingClientRect();
      this.tooltip.style.display = "block";
      this.tooltip.style.left = `${event.clientX - bounds.left}px`;
      this.tooltip.textContent = `#${frame} · ${formatFrameTime(frame, this.frameDurationMs)}`;
      if (dragging) {
        seekTo(event.clientX);
      }
    });
    this.track.addEventListener("pointerleave", () => {
      this.tooltip.style.display = "none";
    });
  }
}
