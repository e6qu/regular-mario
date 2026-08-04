import { appendFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export type ServerLogFields = Readonly<Record<string, string | number>>;
export type ServerLogger = (event: string, fields: ServerLogFields) => void;

/**
 * Append newline-delimited JSON without allowing a diagnostics failure to take
 * down a friends' game. Values passed by the server are deliberately redacted
 * metadata (never cookies, passwords, chat bodies, or snapshots).
 */
export function makeFileServerLogger(path: string): ServerLogger {
  const resolvedPath = resolve(path);
  let ready: Promise<void> | undefined;
  let writes = Promise.resolve();
  return (event, fields) => {
    ready ??= mkdir(dirname(resolvedPath), { recursive: true }).then(
      () => undefined,
    );
    const line = `${JSON.stringify({
      timestamp: new Date().toISOString(),
      event,
      ...fields,
    })}\n`;
    writes = writes
      .then(() => ready)
      .then(() => appendFile(resolvedPath, line, "utf8"))
      .catch(() => undefined);
  };
}
