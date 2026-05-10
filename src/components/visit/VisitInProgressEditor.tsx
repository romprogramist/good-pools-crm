"use client";

import { useState, useTransition } from "react";
import type { ChecklistQuestion, Prisma } from "@prisma/client";
import { VisitChecklistSection } from "./VisitChecklistSection";
import { VisitPhotosSection } from "./VisitPhotosSection";
import { VisitExtraWorksSection } from "./VisitExtraWorksSection";
import { VisitChemistrySection } from "./VisitChemistrySection";
import { VisitTotalSection } from "./VisitTotalSection";
import { VisitStickyBar } from "./VisitStickyBar";
import { completeVisitAction } from "@/lib/server-actions/visit-report";

type Photo = { id: string; path: string; originalName?: string | null; uploadedAt: Date };
type Work = { id: string; name: string; price: string };
type ChemRow = {
  id: string;
  nameAtMoment: string;
  unitAtMoment: string;
  priceAtMoment: string;
  qty: string;
};
type ChemItem = { id: string; name: string; unit: string; price: string };

export function VisitInProgressEditor({
  visitId,
  questions,
  initialAnswers,
  photos,
  works,
  chemistry,
  chemistryCatalog,
  initialTotalAmount,
  initialChecklistFilled,
  totalRequired,
  hint,
}: {
  visitId: string;
  questions: ChecklistQuestion[];
  initialAnswers: Record<string, Prisma.JsonValue>;
  photos: Photo[];
  works: Work[];
  chemistry: ChemRow[];
  chemistryCatalog: ChemItem[];
  initialTotalAmount: string | null;
  initialChecklistFilled: number;
  totalRequired: number;
  hint: number;
}) {
  const [checklistFilled, setChecklistFilled] = useState(initialChecklistFilled);
  const [totalAmount, setTotalAmount] = useState<number | null>(
    initialTotalAmount ? Number(initialTotalAmount) : null,
  );
  const [pending, startTransition] = useTransition();

  function handleComplete() {
    startTransition(async () => {
      await completeVisitAction(visitId);
    });
  }

  return (
    <>
      <div className="flex flex-col gap-4 pb-24">
        <VisitChecklistSection
          visitId={visitId}
          questions={questions}
          initialAnswers={initialAnswers}
          onProgressChange={(filled) => setChecklistFilled(filled)}
        />
        <VisitPhotosSection visitId={visitId} photos={photos} />
        <VisitExtraWorksSection visitId={visitId} works={works} />
        <VisitChemistrySection visitId={visitId} rows={chemistry} catalog={chemistryCatalog} />
        <VisitTotalSection
          visitId={visitId}
          initialAmount={initialTotalAmount}
          hint={hint}
          onAmountChange={setTotalAmount}
        />
      </div>

      <VisitStickyBar
        checklistFilled={checklistFilled}
        checklistTotal={totalRequired}
        photoCount={photos.length}
        totalAmount={totalAmount}
        onComplete={handleComplete}
        pending={pending}
      />
    </>
  );
}
