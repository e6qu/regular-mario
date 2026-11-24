// The presenter's quick controls for talk mode: previous, a list of every slide to jump
// to, next, and the sound switch. A small bar in the corner over the game. Buttons give
// focus back to the page after a click, so Space and the arrows keep driving the game.
import {
  isAudioMuted,
  onAudioMutedChange,
  toggleAudioMuted,
} from "../audio-mute";

export interface TalkToolbar {
  readonly element: HTMLElement;
  readonly setCurrent: (index: number) => void;
  readonly dispose: () => void;
}

export interface TalkToolbarActions {
  readonly go: (index: number) => void;
  readonly step: (delta: number) => void;
}

const svgNamespace = "http://www.w3.org/2000/svg";

// 16×16 pixel-style speaker, with sound waves when on and a cross when muted.
const speakerOn =
  "M2 6h3l4-3v10l-4-3H2zM11 5c1.5 1 1.5 5 0 6M13 3c3 2 3 8 0 10";
const speakerOff = "M2 6h3l4-3v10l-4-3H2zM11 6l4 4M15 6l-4 4";

function speakerIcon(document: Document, muted: boolean): SVGSVGElement {
  const svg = document.createElementNS(svgNamespace, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(svgNamespace, "path");
  path.setAttribute("d", muted ? speakerOff : speakerOn);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "1.6");
  path.setAttribute("stroke-linejoin", "round");
  path.setAttribute("stroke-linecap", "round");
  svg.append(path);
  return svg;
}

const barStyle = [
  "position:fixed",
  "right:12px",
  "bottom:12px",
  "z-index:1000",
  "display:flex",
  "gap:4px",
  "align-items:center",
  "padding:4px",
  "border-radius:8px",
  "background:rgba(15,15,20,.78)",
  "color:#f5f5f5",
  "font:12px/1.2 system-ui,sans-serif",
].join(";");

const controlStyle = [
  "min-width:32px",
  "height:32px",
  "border:1px solid rgba(255,255,255,.25)",
  "border-radius:6px",
  "background:transparent",
  "color:inherit",
  "font:inherit",
  "cursor:pointer",
  "display:inline-flex",
  "align-items:center",
  "justify-content:center",
].join(";");

export function createTalkToolbar(
  document: Document,
  titles: readonly string[],
  actions: TalkToolbarActions,
): TalkToolbar {
  const bar = document.createElement("nav");
  bar.setAttribute("aria-label", "Slides");
  bar.style.cssText = barStyle;

  const button = (
    label: string,
    content: string | SVGSVGElement,
    onClick: () => void,
  ): HTMLButtonElement => {
    const element = document.createElement("button");
    element.type = "button";
    element.setAttribute("aria-label", label);
    element.title = label;
    element.style.cssText = controlStyle;
    element.append(content);
    element.addEventListener("click", () => {
      onClick();
      element.blur();
    });
    return element;
  };

  const previous = button("Previous slide (PageUp)", "◀", () => {
    actions.step(-1);
  });
  const next = button("Next slide (PageDown)", "▶", () => {
    actions.step(1);
  });

  const picker = document.createElement("select");
  picker.setAttribute(
    "aria-label",
    "Go to slide (or type its number, then Enter)",
  );
  picker.title = "Go to slide (or type its number, then Enter)";
  picker.style.cssText = `${controlStyle};max-width:min(46vw,320px);padding:0 6px;background:#111;`;
  titles.forEach((title, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = `${String(index + 1)}. ${title}`;
    picker.append(option);
  });
  picker.addEventListener("change", () => {
    actions.go(Number(picker.value));
    picker.blur();
  });

  const mute = button("Mute (M)", speakerIcon(document, isAudioMuted()), () => {
    toggleAudioMuted();
  });
  const showMuted = (muted: boolean): void => {
    mute.replaceChildren(speakerIcon(document, muted));
    mute.setAttribute("aria-label", muted ? "Unmute (M)" : "Mute (M)");
    mute.title = muted ? "Unmute (M)" : "Mute (M)";
    mute.setAttribute("aria-pressed", String(muted));
  };
  showMuted(isAudioMuted());
  const stopFollowingMute = onAudioMutedChange(showMuted);

  bar.append(previous, picker, next, mute);
  document.body.append(bar);

  return {
    element: bar,
    setCurrent: (index) => {
      picker.value = String(index);
    },
    dispose: () => {
      stopFollowingMute();
      bar.remove();
    },
  };
}
