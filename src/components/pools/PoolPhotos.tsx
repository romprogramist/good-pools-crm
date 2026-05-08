"use client";

import { useRef, useState } from "react";
import { Card } from "@/components/Page";
import {
  uploadPoolPhotosAction,
  deletePoolPhotoAction,
} from "@/lib/server-actions/pool-photos";

type Scope = "admin" | "service";

type PhotoItem = {
  id: string;
  filename: string;
};

export function PoolPhotos({
  scope,
  customerId,
  poolId,
  photos,
}: {
  scope: Scope;
  customerId: string;
  poolId: string;
  photos: PhotoItem[];
}) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [drag, setDrag] = useState(false);

  const submitForm = () => {
    formRef.current?.requestSubmit();
  };

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-zinc-900">Фотографии объекта</h2>
        <span className="text-xs text-zinc-500">
          {photos.length} {photos.length > 10 && <span className="text-amber-700">(больше 10 — рекомендуем чистить)</span>}
        </span>
      </div>

      <form
        ref={formRef}
        action={uploadPoolPhotosAction}
        className="mt-4"
      >
        <input type="hidden" name="scope" value={scope} />
        <input type="hidden" name="customerId" value={customerId} />
        <input type="hidden" name="poolId" value={poolId} />
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            if (!inputRef.current) return;
            const dt = new DataTransfer();
            for (const f of Array.from(e.dataTransfer.files)) dt.items.add(f);
            inputRef.current.files = dt.files;
            submitForm();
          }}
          className={
            "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition " +
            (drag
              ? "border-teal-400 bg-teal-50"
              : "border-zinc-200 bg-zinc-50 hover:bg-zinc-100")
          }
        >
          <input
            ref={inputRef}
            type="file"
            name="files"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            multiple
            className="hidden"
            onChange={() => submitForm()}
          />
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8 text-zinc-400">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <div className="mt-2 text-sm font-medium text-zinc-700">
            Перетащите фото сюда или нажмите, чтобы выбрать
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            JPG / PNG / WEBP / HEIC, до 10 МБ
          </div>
        </label>
      </form>

      {photos.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {photos.map((p) => {
            const url = `/api/files/pool-photos/${poolId}/${encodeURIComponent(p.filename)}`;
            return (
              <div
                key={p.id}
                className="group relative aspect-square overflow-hidden rounded-lg ring-1 ring-zinc-200"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="h-full w-full object-cover" />
                <form action={deletePoolPhotoAction} className="absolute inset-x-0 bottom-0">
                  <input type="hidden" name="scope" value={scope} />
                  <input type="hidden" name="customerId" value={customerId} />
                  <input type="hidden" name="poolId" value={poolId} />
                  <input type="hidden" name="photoId" value={p.id} />
                  <button
                    type="submit"
                    className="w-full bg-black/60 px-2 py-1 text-xs font-medium text-white opacity-0 transition group-hover:opacity-100"
                  >
                    Удалить
                  </button>
                </form>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
