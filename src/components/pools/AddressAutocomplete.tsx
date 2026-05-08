"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  searchAddresses,
  type AddressSuggestion,
} from "@/lib/server-actions/geocode";

const DEBOUNCE_MS = 350;

export function AddressAutocomplete({
  value,
  onChange,
  onPick,
  placeholder,
  rightButton,
}: {
  value: string;
  onChange: (v: string) => void;
  onPick: (s: AddressSuggestion) => void;
  placeholder?: string;
  rightButton?: React.ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const lastQueryRef = useRef<string>("");
  const reqIdRef = useRef(0);

  useEffect(() => {
    const q = value.trim();
    if (q.length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    if (q === lastQueryRef.current) return;

    const id = ++reqIdRef.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const results = await searchAddresses(q);
        if (reqIdRef.current !== id) return;
        lastQueryRef.current = q;
        setSuggestions(results);
        setOpen(results.length > 0);
        setActiveIdx(-1);
      } finally {
        if (reqIdRef.current === id) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(t);
  }, [value]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const pick = (s: AddressSuggestion) => {
    onPick(s);
    setOpen(false);
    setActiveIdx(-1);
    lastQueryRef.current = s.displayName;
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter" && activeIdx >= 0) {
      e.preventDefault();
      pick(suggestions[activeIdx]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            id="address"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => suggestions.length > 0 && setOpen(true)}
            onKeyDown={onKey}
            placeholder={placeholder}
            autoComplete="off"
            className="h-11 w-full text-base"
          />
          {loading && (
            <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400">
              ищу...
            </div>
          )}
        </div>
        {rightButton}
      </div>

      {open && suggestions.length > 0 && (
        <ul className="absolute left-0 right-0 z-20 mt-1 max-h-72 overflow-y-auto rounded-lg border border-zinc-200 bg-white py-1 shadow-lg">
          {suggestions.map((s, i) => (
            <li key={`${s.lat}-${s.lng}-${i}`}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(s)}
                onMouseEnter={() => setActiveIdx(i)}
                className={
                  "flex w-full items-start gap-2 px-3 py-2 text-left text-sm transition " +
                  (i === activeIdx ? "bg-teal-50 text-zinc-900" : "text-zinc-700 hover:bg-zinc-50")
                }
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="mt-0.5 h-4 w-4 shrink-0 text-teal-600"
                >
                  <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                <span className="flex-1">{s.displayName}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
