export function getMapsApiKey(): string | null {
  const raw = process.env.YANDEX_MAPS_API_KEY?.trim();
  if (!raw) return null;
  // Treat common placeholder values as missing.
  if (/^(your-|place|xxx|todo|<)/i.test(raw)) return null;
  return raw;
}
