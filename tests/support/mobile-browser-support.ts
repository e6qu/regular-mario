import { expect, type Locator, type Page } from "@playwright/test";

export async function expectInsideViewport(locator: Locator): Promise<void> {
  const geometry = await locator.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return {
      left: box.left,
      right: box.right,
      top: box.top,
      bottom: box.bottom,
      width: window.innerWidth,
      height: window.innerHeight,
    };
  });
  expect(geometry.left).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(geometry.width + 1);
  expect(geometry.top).toBeGreaterThanOrEqual(0);
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.height + 1);
}

export async function controlTouchPoint(page: Page, label: string, id: number) {
  const box = await page
    .getByRole("button", { name: label, exact: true })
    .boundingBox();
  if (box === null) {
    throw new Error(`Missing touch control ${label}.`);
  }
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, id };
}

// Actual browser touch streams exercise implicit pointer capture, cancellation
// and multiple fingers. Mouse presses cannot prove those mobile behaviours.
export async function createTouchDriver(page: Page) {
  const session = await page.context().newCDPSession(page);
  return {
    send: async (
      type: "touchStart" | "touchMove" | "touchEnd" | "touchCancel",
      touchPoints: readonly { x: number; y: number; id: number }[],
    ): Promise<void> => {
      await session.send("Input.dispatchTouchEvent", {
        type,
        touchPoints: [...touchPoints],
      });
    },
    close: () => session.detach(),
  };
}
