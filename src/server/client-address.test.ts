import type { IncomingMessage } from "node:http";
import { describe, expect, it } from "vitest";

import { parseTrustedProxies } from "./client-address";

function request(
  peer: string | undefined,
  forwardedFor?: string | string[],
): IncomingMessage {
  return {
    socket: { remoteAddress: peer },
    headers:
      forwardedFor === undefined ? {} : { "x-forwarded-for": forwardedFor },
  } as unknown as IncomingMessage;
}

describe("client address", () => {
  const resolve = parseTrustedProxies("10.89.0.2, 192.168.7.0/24");

  it("keys a direct client by its peer and ignores the header it wrote", () => {
    expect(resolve(request("203.0.113.9", "198.51.100.1"))).toBe("203.0.113.9");
  });

  it("keys a client behind a trusted proxy by the address the proxy forwards", () => {
    expect(resolve(request("::ffff:10.89.0.2", "198.51.100.1"))).toBe(
      "198.51.100.1",
    );
    expect(resolve(request("10.89.0.2", "1.2.3.4, 198.51.100.1"))).toBe(
      "198.51.100.1",
    );
    expect(resolve(request("10.89.0.2", ["198.51.100.1", "192.168.7.4"]))).toBe(
      "198.51.100.1",
    );
    expect(resolve(request("10.89.0.2"))).toBe("10.89.0.2");
  });

  it("refuses what it cannot resolve instead of sharing one key", () => {
    expect(() => resolve(request("10.89.0.2", "unknown"))).toThrow(
      /not an address/,
    );
    expect(() => resolve(request(undefined))).toThrow(/no peer address/);
  });

  it("refuses a trusted proxy that is not an address or range", () => {
    for (const list of ["caddy", "10.0.0.0/40", "10.0.0.0/x"]) {
      expect(() => parseTrustedProxies(list)).toThrow(
        /neither an address nor a CIDR range/,
      );
    }
  });
});
