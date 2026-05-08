"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/Page";
import { PoolMap } from "@/components/pools/PoolMap";
import { AddressAutocomplete } from "@/components/pools/AddressAutocomplete";
import { createPoolAction, updatePoolAction } from "@/lib/server-actions/pools";
import { geocodeAddress } from "@/lib/server-actions/geocode";

type Scope = "admin" | "service";

export type PoolFormInitial = {
  id?: string;
  name?: string;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  facingMaterials?: string | null;
  extraField?: string | null;
  individualServicePrice?: string | null;
};

export function PoolForm({
  scope,
  customerId,
  initial,
  mapsApiKey,
  cancelHref,
}: {
  scope: Scope;
  customerId: string;
  initial?: PoolFormInitial;
  mapsApiKey: string | null;
  cancelHref: string;
}) {
  const isEdit = Boolean(initial?.id);
  const action = isEdit ? updatePoolAction : createPoolAction;

  const [lat, setLat] = useState<string>(
    initial?.lat != null ? String(initial.lat) : "",
  );
  const [lng, setLng] = useState<string>(
    initial?.lng != null ? String(initial.lng) : "",
  );
  const [address, setAddress] = useState<string>(initial?.address ?? "");
  const [geocodeMsg, setGeocodeMsg] = useState<string | null>(null);
  const [isGeocoding, startGeocode] = useTransition();

  const latNum = lat ? Number(lat.replace(",", ".")) : null;
  const lngNum = lng ? Number(lng.replace(",", ".")) : null;
  const hasCoords = latNum != null && lngNum != null && Number.isFinite(latNum) && Number.isFinite(lngNum);

  const findOnMap = () => {
    if (!address.trim()) {
      setGeocodeMsg("Введите адрес, чтобы найти точку.");
      return;
    }
    setGeocodeMsg(null);
    startGeocode(async () => {
      const r = await geocodeAddress(address);
      if (!r) {
        setGeocodeMsg("Не нашли. Уточните адрес или передвиньте маркер вручную.");
        return;
      }
      setLat(r.lat.toFixed(6));
      setLng(r.lng.toFixed(6));
      setGeocodeMsg(`Найдено: ${r.displayName}`);
    });
  };

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="scope" value={scope} />
      <input type="hidden" name="customerId" value={customerId} />
      {isEdit && <input type="hidden" name="poolId" value={initial!.id!} />}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <FormField label="Название бассейна" htmlFor="name">
            <Input
              id="name"
              name="name"
              required
              minLength={1}
              maxLength={120}
              defaultValue={initial?.name ?? ""}
              placeholder="Например: основной бассейн, СПА, детский"
              className="h-11 text-base"
            />
          </FormField>

          <FormField
            label="Адрес"
            htmlFor="address"
            hint="Начните вводить — появятся подсказки. Выберите вариант, точка встанет на карте автоматически."
          >
            <AddressAutocomplete
              value={address}
              onChange={setAddress}
              onPick={(s) => {
                setAddress(s.displayName);
                setLat(s.lat.toFixed(6));
                setLng(s.lng.toFixed(6));
                setGeocodeMsg(null);
              }}
              placeholder="например: Сочи, Курортный проспект 75"
              rightButton={
                <button
                  type="button"
                  onClick={findOnMap}
                  disabled={isGeocoding || !address.trim()}
                  title="Поставить точку точно по введённому адресу"
                  className="inline-flex h-11 items-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isGeocoding ? "Ищу..." : "Найти"}
                </button>
              }
            />
            {geocodeMsg && (
              <p className="mt-1 text-xs text-zinc-600">{geocodeMsg}</p>
            )}
          </FormField>

          <input type="hidden" name="address" value={address} />
          <input type="hidden" name="lat" value={lat} />
          <input type="hidden" name="lng" value={lng} />

          <div className="text-xs text-zinc-500">
            {hasCoords
              ? `📍 Координаты: ${latNum!.toFixed(6)}, ${lngNum!.toFixed(6)}`
              : "📍 Координаты пока не заданы"}
          </div>

          <FormField
            label="Облицовочные покрытия"
            htmlFor="facingMaterials"
            hint="Например: мозаика, плитка, плёнка ПВХ"
          >
            <textarea
              id="facingMaterials"
              name="facingMaterials"
              rows={2}
              defaultValue={initial?.facingMaterials ?? ""}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
            />
          </FormField>

          <FormField label="Дополнительная информация" htmlFor="extraField">
            <textarea
              id="extraField"
              name="extraField"
              rows={3}
              defaultValue={initial?.extraField ?? ""}
              placeholder="Любая важная информация: подъезд, ключи, особенности"
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
            />
          </FormField>

          <FormField
            label="Индивидуальная цена сервиса, ₽"
            htmlFor="individualServicePrice"
            hint="Если оставить пустым — цена считается по общему прайсу"
          >
            <Input
              id="individualServicePrice"
              name="individualServicePrice"
              defaultValue={
                initial?.individualServicePrice ? String(initial.individualServicePrice) : ""
              }
              placeholder="например, 5000"
              inputMode="decimal"
              className="h-11 text-base"
            />
          </FormField>
        </div>

        <div className="space-y-3">
          <div className="text-sm font-medium text-zinc-700">Точка на карте</div>
          <PoolMap
            apiKey={mapsApiKey}
            initialLat={hasCoords ? latNum : null}
            initialLng={hasCoords ? lngNum : null}
            onChange={(la, ln) => {
              setLat(la != null ? la.toFixed(6) : "");
              setLng(ln != null ? ln.toFixed(6) : "");
            }}
          />
          <p className="text-xs text-zinc-500">
            Введите адрес и нажмите «Найти на карте». Если точка встала неточно —
            перетащите маркер или кликните по нужному месту.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-5">
        <Button
          type="submit"
          className="h-11 bg-teal-600 px-5 text-sm font-semibold text-white shadow-sm hover:bg-teal-700"
        >
          {isEdit ? "Сохранить" : "Создать бассейн"}
        </Button>
        <Link
          href={cancelHref}
          className="inline-flex h-11 items-center rounded-lg px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
        >
          Отмена
        </Link>
      </div>
    </form>
  );
}
