// A slide as plain text, for the sign's copy button: what the sign shows, in its order,
// then each link's address once. The sign is drawn on a canvas, so this is how its words
// reach the clipboard.
import type { TalkSlide } from "./talk-script";

export function talkSlideText(slide: TalkSlide): string {
  const lines: string[] = [];
  if (slide.kicker !== null) {
    lines.push(slide.kicker);
  }
  if (slide.title !== null) {
    lines.push(slide.title);
  }
  if (slide.quote !== null) {
    lines.push(`“${slide.quote}”`);
  }
  if (slide.cite !== null) {
    lines.push(`— ${slide.cite}`);
  }
  lines.push(...slide.lead);
  lines.push(...slide.bullets.map((bullet) => `- ${bullet}`));
  for (const column of slide.columns) {
    lines.push(column.label, ...column.bullets.map((bullet) => `- ${bullet}`));
  }
  if (slide.table !== null) {
    lines.push(
      ...[slide.table.head, ...slide.table.rows].map((row) => row.join(" | ")),
    );
  }
  const seen = new Set<string>();
  const links = slide.links.filter((link) => {
    if (seen.has(link.url)) {
      return false;
    }
    seen.add(link.url);
    return true;
  });
  if (links.length > 0) {
    lines.push("", ...links.map((link) => `${link.text}: ${link.url}`));
  }
  return `${lines.join("\n")}\n`;
}
