"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";

const SOCHI_CENTER: [number, number] = [43.6028, 39.7233];
const DEFAULT_ZOOM = 13;

export function LeafletMap({
  initialLat,
  initialLng,
  onChange,
}: {
  initialLat: number | null;
  initialLng: number | null;
  onChange: (lat: number | null, lng: number | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const markerRef = useRef<import("leaflet").Marker | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let map: import("leaflet").Map | null = null;
    let marker: import("leaflet").Marker | null = null;

    import("leaflet")
      .then((L) => {
        if (cancelled || !containerRef.current) return;

        const center: [number, number] =
          initialLat != null && initialLng != null
            ? [initialLat, initialLng]
            : SOCHI_CENTER;

        map = L.map(containerRef.current, {
          center,
          zoom: DEFAULT_ZOOM,
          zoomControl: true,
          attributionControl: false,
        });

        L.control
          .attribution({ prefix: false })
          .addAttribution("© OpenStreetMap")
          .addTo(map);

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
        }).addTo(map);

        const icon = L.divIcon({
          className: "",
          html: `<div style="width:20px;height:20px;border-radius:9999px;background:#0d9488;border:4px solid #99f6e4;box-shadow:0 2px 8px rgba(0,0,0,0.25);transform:translate(-50%,-50%);"></div>`,
          iconSize: [0, 0],
        });

        marker = L.marker(center, { draggable: true, icon }).addTo(map);

        marker.on("dragend", () => {
          if (!marker) return;
          const { lat, lng } = marker.getLatLng();
          onChange(lat, lng);
        });

        map.on("click", (e) => {
          if (!marker || !map) return;
          marker.setLatLng(e.latlng);
          onChange(e.latlng.lat, e.latlng.lng);
        });

        mapRef.current = map;
        markerRef.current = marker;
        setReady(true);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });

    return () => {
      cancelled = true;
      try {
        marker?.remove();
        map?.remove();
      } catch {
        // ignore
      }
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reposition marker and recenter when coordinates change from outside
  // (geocoding result, manual input).
  useEffect(() => {
    if (!ready || !mapRef.current || !markerRef.current) return;
    if (initialLat == null || initialLng == null) return;
    markerRef.current.setLatLng([initialLat, initialLng]);
    mapRef.current.setView([initialLat, initialLng], Math.max(mapRef.current.getZoom(), 15));
  }, [initialLat, initialLng, ready]);

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
