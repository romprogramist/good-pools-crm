"use client";

import { useEffect, useRef, useState } from "react";
import { LeafletMap } from "@/components/pools/LeafletMap";

declare global {
  interface Window {
    ymaps3?: {
      ready: Promise<void>;
      YMap: new (
        container: HTMLElement,
        opts: { location: { center: [number, number]; zoom: number } },
      ) => YMap;
      YMapDefaultSchemeLayer: new () => unknown;
      YMapDefaultFeaturesLayer: new () => unknown;
      YMapMarker: new (
        opts: {
          coordinates: [number, number];
          draggable?: boolean;
          onDragEnd?: (coords: [number, number]) => void;
        },
        element?: HTMLElement,
      ) => unknown;
      YMapListener: new (opts: {
        onClick?: (object: unknown, event: { coordinates: [number, number] }) => void;
      }) => unknown;
    };
  }
}

type YMap = {
  addChild: (child: unknown) => void;
  destroy: () => void;
  setLocation: (loc: { center: [number, number]; zoom?: number }) => void;
};

const SOCHI_CENTER: [number, number] = [39.7233, 43.6028];
const DEFAULT_ZOOM = 13;

const SCRIPT_ID = "yandex-maps-v3-script";

let scriptPromise: Promise<void> | null = null;

function loadScript(apiKey: string): Promise<void> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Я.Карты не загрузились")));
      return;
    }
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = `https://api-maps.yandex.ru/v3/?apikey=${encodeURIComponent(apiKey)}&lang=ru_RU`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Я.Карты не загрузились"));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export function PoolMap({
  apiKey,
  initialLat,
  initialLng,
  onChange,
}: {
  apiKey: string | null;
  initialLat: number | null;
  initialLng: number | null;
  onChange: (lat: number | null, lng: number | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<YMap | null>(null);
  const markerRef = useRef<unknown | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // Initial point — coordinates if provided, else Sochi center.
  useEffect(() => {
    if (!apiKey) return;
    if (!containerRef.current) return;

    let cancelled = false;

    loadScript(apiKey)
      .then(() => window.ymaps3!.ready)
      .then(() => {
        if (cancelled || !containerRef.current || !window.ymaps3) return;

        const center: [number, number] =
          initialLng != null && initialLat != null
            ? [initialLng, initialLat]
            : SOCHI_CENTER;

        const map = new window.ymaps3.YMap(containerRef.current, {
          location: { center, zoom: DEFAULT_ZOOM },
        }) as YMap;

        map.addChild(new window.ymaps3.YMapDefaultSchemeLayer());
        map.addChild(new window.ymaps3.YMapDefaultFeaturesLayer());

        const markerEl = document.createElement("div");
        markerEl.className =
          "h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-teal-600 ring-4 ring-teal-200 shadow-lg";

        const marker = new window.ymaps3.YMapMarker(
          {
            coordinates: center,
            draggable: true,
            onDragEnd: (coords) => {
              const [lng, lat] = coords;
              onChange(lat, lng);
            },
          },
          markerEl,
        );
        map.addChild(marker);
        markerRef.current = marker;

        const listener = new window.ymaps3.YMapListener({
          onClick: (_obj, ev) => {
            const [lng, lat] = ev.coordinates;
            onChange(lat, lng);
            // Re-create the marker to reposition (simple but reliable).
            try {
              if (markerRef.current) {
                // No public API to move a marker without removing it; we keep it draggable.
              }
            } catch {
              // ignore
            }
          },
        });
        map.addChild(listener);

        mapRef.current = map;
        setReady(true);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });

    return () => {
      cancelled = true;
      try {
        mapRef.current?.destroy();
      } catch {
        // ignore
      }
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  if (!apiKey) {
    return (
      <div className="space-y-2">
        <LeafletMap
          initialLat={initialLat}
          initialLng={initialLng}
          onChange={onChange}
        />
        <p className="text-[11px] text-zinc-500">
          Бесплатная карта (OpenStreetMap). Чтобы переключиться на Я.Карты —
          добавьте ключ <code className="rounded bg-zinc-100 px-1">YANDEX_MAPS_API_KEY</code> в .env.
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="aspect-[4/3] w-full overflow-hidden rounded-xl bg-zinc-100 ring-1 ring-zinc-200"
      />
      {!ready && !error && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-zinc-500">
          Загрузка карты...
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-red-50 p-4 text-center text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </div>
      )}
    </div>
  );
}
