import { BlockList, isIP } from "node:net";
import type { IncomingMessage } from "node:http";

// Behind a reverse proxy every request arrives from the proxy, so a limit
// keyed on the socket peer would treat every player as one. A proxy named in
// the trusted list reports the client in X-Forwarded-For; any other peer is the
// client, and its X-Forwarded-For is ignored because the peer wrote it.
export type ClientAddressResolver = (request: IncomingMessage) => string;

function family(address: string): "ipv4" | "ipv6" {
  return isIP(address) === 4 ? "ipv4" : "ipv6";
}

function unmapped(address: string): string {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  return mapped?.[1] ?? address;
}

export function parseTrustedProxies(list: string): ClientAddressResolver {
  const trusted = new BlockList();
  for (const rawEntry of list.split(",")) {
    const entry = rawEntry.trim();
    if (entry.length === 0) {
      continue;
    }
    const [address = "", prefixText] = entry.split("/");
    if (isIP(address) === 0) {
      throw new Error(
        `Trusted proxy ${JSON.stringify(entry)} is neither an address nor a CIDR range.`,
      );
    }
    if (prefixText === undefined) {
      trusted.addAddress(address, family(address));
      continue;
    }
    const prefix = Number(prefixText);
    const bits = isIP(address) === 4 ? 32 : 128;
    if (!/^\d+$/.test(prefixText) || prefix > bits) {
      throw new Error(
        `Trusted proxy ${JSON.stringify(entry)} is neither an address nor a CIDR range.`,
      );
    }
    trusted.addSubnet(address, prefix, family(address));
  }

  const trusts = (address: string): boolean =>
    trusted.check(address, family(address));

  return (request) => {
    const socketAddress = request.socket.remoteAddress;
    if (socketAddress === undefined) {
      throw new Error("The request's connection has no peer address.");
    }
    const peer = unmapped(socketAddress);
    if (!trusts(peer)) {
      return peer;
    }
    const header = request.headers["x-forwarded-for"];
    const joined = Array.isArray(header) ? header.join(",") : (header ?? "");
    const entries = joined.split(",");
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = entries[index]?.trim() ?? "";
      if (entry.length === 0) {
        continue;
      }
      const address = unmapped(entry);
      if (isIP(address) === 0) {
        throw new Error(
          `Trusted proxy ${peer} forwarded ${JSON.stringify(entry)}, which is not an address.`,
        );
      }
      if (!trusts(address)) {
        return address;
      }
    }
    return peer;
  };
}
