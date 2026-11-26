// The talk format alone, without the game: parse and validate a talk script (the
// JSON e6qu.github.io's deck builder writes) in Node or a page that never mounts it,
// and check that every slide fits its sign in the game, before anyone presses Play.
import { layoutTalkSigns } from "../shell/talk/talk-signs";
import type { TalkScript } from "../shell/talk/talk-script";

export {
  parseTalkScript,
  TalkScriptError,
  type TalkDiagram,
  type TalkLink,
  type TalkScript,
  type TalkSlide,
  type TalkTransition,
} from "../shell/talk/talk-script";
export { TalkOverflowError } from "../shell/talk/talk-signs";
export { TalkArtError } from "../shell/talk/talk-scene";
export { UnsupportedTalkCharacterError } from "../shell/talk/talk-font";

// Throws, as mountTalk would, if a slide's text does not fit its sign
// (TalkOverflowError, naming each slide and its overflow in pixels), a slide has no art
// of its own or no room for its scene (TalkArtError), or uses a character the game's
// font lacks (UnsupportedTalkCharacterError).
export function checkTalkSigns(script: TalkScript): void {
  layoutTalkSigns(script);
}
