// The talk format alone, without the game: parse and validate a talk script (the
// JSON e6qu.github.io's deck builder writes) in Node or a page that never mounts it.
export {
  parseTalkScript,
  TalkScriptError,
  type TalkDiagram,
  type TalkLink,
  type TalkScript,
  type TalkSlide,
  type TalkTransition,
} from "../shell/talk/talk-script";
