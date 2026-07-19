import { randomBytes, randomUUID } from "crypto";

export function newId(): string {
  return randomUUID();
}

export function newToken(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

export function newApiKeyPlain(): { plain: string; prefix: string } {
  const plain = `scrm_${randomBytes(24).toString("hex")}`;
  return { plain, prefix: plain.slice(0, 12) };
}
