"use client";

import { useRef, useState } from "react";
import { Card } from "@/components/Page";
import { buttonVariants } from "@/components/ui/button";
import { uploadVisitPhotosAction, deleteVisitPhotoAction } from "@/lib/server-actions/visit-report";
import { cn } from "@/lib/utils";

type Photo = { id: string; path: string; originalName?: string | null; uploadedAt: Date };

export function VisitPhotosSection({
  visitId,
  photos,
  disabled = false,
}: {
  visitId: string;
  photos: Photo[];
  disabled?: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files || e.target.files.length === 0) return;
    setPending(true);
    const fd = new FormData();
    fd.append("visitId", visitId);
    for (const file of Array.from(e.target.files)) {
      fd.append("files", file);
    }
    try {
      await uploadVisitPhotosAction(fd);
    } finally {
      setPending(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Фото объекта ({photos.length})</h2>
      </div>

      {photos.length === 0 && (
        <p className="mb-3 text-sm text-zinc-500">Нужно прикрепить минимум 1 фото для завершения визита.</p>
      )}

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {photos.map((p) => (
          <div key={p.id} className="relative aspect-square overflow-hidden rounded-md border border-zinc-200 bg-zinc-50">
            <img
              src={`/api/files/${p.path}`}
              alt={p.originalName ?? ""}
              className="h-full w-full object-cover"
            />
            {!disabled && (
              <form action={deleteVisitPhotoAction} className="absolute right-1 top-1">
                <input type="hidden" name="visitId" value={visitId} />
                <input type="hidden" name="photoId" value={p.id} />
                <button
                  type="submit"
                  className="rounded-full bg-black/60 px-2 py-1 text-xs text-white hover:bg-black/80"
                  aria-label="Удалить фото"
                >
                  ✕
                </button>
              </form>
            )}
          </div>
        ))}
      </div>

      {!disabled && (
        <div className="mt-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            capture="environment"
            onChange={onFileChange}
            disabled={pending}
            className="hidden"
            id={`photo-input-${visitId}`}
          />
          {/* Button is @base-ui (no asChild/Slot), so we use a styled label */}
          <label
            htmlFor={`photo-input-${visitId}`}
            className={cn(
              buttonVariants(),
              pending ? "pointer-events-none opacity-50" : "cursor-pointer",
            )}
          >
            {pending ? "Загрузка..." : "+ Добавить фото"}
          </label>
        </div>
      )}
    </Card>
  );
}
