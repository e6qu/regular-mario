// Props that keep swapping places, like disks in the Towers of Hanoi: each step, two
// neighbours trade slots, the one going right hopping over the one sliding left. The
// steps alternate between the left pair and the right pair, so three props cycle
// through every order and come back. Used for a slide whose props are all switch
// blocks (the Switch Palaces). Pure: no Phaser.

export const talkShuffleStepMilliseconds = 1200;
// the share of each step spent moving; the rest is a pause in the new order
const moveShare = 0.5;

export interface TalkShufflePlace {
  // where the prop stands, in slots from the left (fractional while it moves)
  readonly slot: number;
  // how high it is in its hop, 0 on the ground to 1 at the top
  readonly lift: number;
}

// The pair of slots swapped at step `step`: its left slot.
function swapAt(step: number, count: number): number {
  return step % (count - 1);
}

// Which prop stands in each slot after `steps` swaps.
function orderAfter(steps: number, count: number): number[] {
  const order = Array.from({ length: count }, (_, index) => index);
  for (let step = 0; step < steps; step++) {
    const left = swapAt(step, count);
    const right = left + 1;
    [order[left], order[right]] = [order[right] ?? right, order[left] ?? left];
  }
  return order;
}

// The number of steps after which every prop is back where it started.
function shufflePeriod(count: number): number {
  for (let steps = 1; steps <= 2 * count * count; steps++) {
    if (orderAfter(steps, count).every((prop, slot) => prop === slot)) {
      return steps;
    }
  }
  return 2 * count * count;
}

// Where each of `count` props is at `timeMilliseconds`, indexed by prop.
export function talkShufflePlaces(
  count: number,
  timeMilliseconds: number,
): readonly TalkShufflePlace[] {
  if (count < 2) {
    return Array.from({ length: count }, () => ({ slot: 0, lift: 0 }));
  }
  const elapsed = Math.max(0, timeMilliseconds);
  const step =
    Math.floor(elapsed / talkShuffleStepMilliseconds) % shufflePeriod(count);
  const within =
    (elapsed % talkShuffleStepMilliseconds) / talkShuffleStepMilliseconds;
  const moved = Math.min(1, within / moveShare);
  // eased, so a hop starts and lands gently
  const progress = moved * moved * (3 - 2 * moved);
  const order = orderAfter(step, count);
  const left = swapAt(step, count);
  const places: TalkShufflePlace[] = [];
  order.forEach((prop, slot) => {
    places[prop] =
      slot === left
        ? { slot: slot + progress, lift: Math.sin(Math.PI * progress) }
        : slot === left + 1
          ? { slot: slot - progress, lift: 0 }
          : { slot, lift: 0 };
  });
  return places;
}
