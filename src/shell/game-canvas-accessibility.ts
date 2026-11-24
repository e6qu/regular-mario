// The game canvas as one focusable, labelled image: keyboard input needs a focus
// target, and screen readers get a name instead of an unlabelled canvas.
const gameCanvasLabel = "Original platformer game canvas";

export function configureGameCanvasForAccessibility(
  canvas: HTMLCanvasElement,
): void {
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", gameCanvasLabel);
  canvas.tabIndex = 0;
  // Keep the upscaled canvas crisp (nearest-neighbor) instead of blurred.
  canvas.style.imageRendering = "pixelated";
}
