import { createHash, randomBytes, randomInt } from "node:crypto";

// Без похожих символов (0/O, 1/I/L) — id диктуют голосом и переписывают руками.
const ID_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function generateExternalId(): string {
  let s = "";
  for (let i = 0; i < 8; i += 1) s += ID_ALPHABET[randomInt(ID_ALPHABET.length)];
  return `WB-${s}`;
}

export function generateToken(): string {
  return `gpm_${randomBytes(32).toString("base64url")}`;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function tokenHint(token: string): string {
  return token.slice(-4);
}

export function webhookUrl(): string {
  const base = (process.env.APP_URL ?? process.env.NEXTAUTH_URL ?? "").replace(/\/+$/, "");
  return `${base}/api/monitoring/webhook`;
}
