"use server";

import { auth } from "@/lib/auth";

export type GeocodeResult = {
  lat: number;
  lng: number;
  displayName: string;
};

export type AddressSuggestion = {
  displayName: string;
  lat: number;
  lng: number;
};

const NOMINATIM_HEADERS = {
  "User-Agent": "GoodPoolsCRM/1.0 (admin@goodpools.local)",
  "Accept-Language": "ru",
} as const;

export async function geocodeAddress(query: string): Promise<GeocodeResult | null> {
  const session = await auth();
  if (!session?.user) return null;

  const trimmed = query.trim();
  if (!trimmed) return null;

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("q", trimmed);
  url.searchParams.set("limit", "1");
  url.searchParams.set("accept-language", "ru");

  const res = await fetch(url, { headers: NOMINATIM_HEADERS, cache: "no-store" });
  if (!res.ok) return null;

  const data = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
  if (!data.length) return null;

  const lat = parseFloat(data[0].lat);
  const lng = parseFloat(data[0].lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return { lat, lng, displayName: data[0].display_name };
}

export async function searchAddresses(query: string): Promise<AddressSuggestion[]> {
  const session = await auth();
  if (!session?.user) return [];

  const trimmed = query.trim();
  if (trimmed.length < 3) return [];

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("q", trimmed);
  url.searchParams.set("limit", "6");
  url.searchParams.set("accept-language", "ru");
  url.searchParams.set("addressdetails", "0");

  const res = await fetch(url, { headers: NOMINATIM_HEADERS, cache: "no-store" });
  if (!res.ok) return [];

  const data = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
  return data
    .map((d) => ({
      displayName: d.display_name,
      lat: parseFloat(d.lat),
      lng: parseFloat(d.lon),
    }))
    .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng));
}
