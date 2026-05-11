import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { PageContainer, PageHeader, Card, Alert } from "@/components/Page";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { VisitForm } from "@/components/calendar/VisitForm";
import { VisitInProgressEditor } from "@/components/visit/VisitInProgressEditor";
import { VisitReadOnlyView } from "@/components/visit/VisitReadOnlyView";
import {
  updateVisitAction,
  cancelVisitAction,
  checkVisitConflicts,
} from "@/lib/server-actions/visits";
import {
  startVisitAction,
  reopenVisitAction,
  listActiveChemistryItems,
} from "@/lib/server-actions/visit-report";
import { decodeChecklistValue, isAnswerEmpty } from "@/lib/visit/checklist-value";
import { formatMoscow } from "@/lib/calendar/dates";

const SERVICE_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

type Params = Promise<{ id: string }>;
type SP = Promise<{ ok?: string; error?: string }>;

export default async function VisitDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SP;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const session = await auth();
  if (!session?.user || (session.user.role !== "admin" && session.user.role !== "service")) {
    redirect("/");
  }

  const visit = await prisma.visit.findUnique({
    where: { id },
    include: {
      pool: { include: { customer: true } },
      serviceUser: true,
      series: { select: { id: true, recurrence: true, occurrences: true } },
      onlineRequest: { select: { id: true } },
      checklistAnswers: { include: { question: true } },
      photos: { orderBy: { uploadedAt: "asc" } },
      extraWorks: { orderBy: { order: "asc" } },
      chemistry: { orderBy: { order: "asc" } },
    },
  });

  if (!visit) {
    return (
      <>
        <Header />
        <PageContainer>
          <PageHeader title="Визит не найден" />
          <div className="mt-6"><Alert variant="error">Этот визит не существует.</Alert></div>
          <div className="mt-4">
            <Link href="/service/calendar"><Button variant="secondary">← В календарь</Button></Link>
          </div>
        </PageContainer>
      </>
    );
  }

  const isAdmin = session.user.role === "admin";
  const isOwnVisit = visit.serviceUserId === session.user.id;
  const withinEditWindow =
    visit.completedAt &&
    Date.now() - visit.completedAt.getTime() < SERVICE_EDIT_WINDOW_MS;
  const canReopen = isAdmin || (isOwnVisit && withinEditWindow);

  return (
    <>
      <Header />
      <PageContainer size="narrow">
        <PageHeader
          title={`Визит ${formatMoscow(visit.scheduledAt)}`}
          subtitle={`${visit.pool.customer.fullName} — ${visit.pool.name}`}
        />

        {sp.ok && <div className="mt-4"><Alert variant="success">{decodeURIComponent(sp.ok)}</Alert></div>}
        {sp.error && <div className="mt-4"><Alert variant="error">{decodeURIComponent(sp.error)}</Alert></div>}

        <Card className="mt-4">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <dt className="text-zinc-500">Статус</dt>
            <dd>{visit.status}</dd>
            <dt className="text-zinc-500">Тип</dt>
            <dd>{visit.kind}</dd>
            <dt className="text-zinc-500">Сервисник</dt>
            <dd>{visit.serviceUser.name ?? "—"}</dd>
            <dt className="text-zinc-500">Длительность</dt>
            <dd>{visit.durationMinutes} мин</dd>
            {visit.startedAt && (
              <><dt className="text-zinc-500">Начат</dt><dd>{formatMoscow(visit.startedAt)}</dd></>
            )}
            {visit.completedAt && (
              <><dt className="text-zinc-500">Завершён</dt><dd>{formatMoscow(visit.completedAt)}</dd></>
            )}
            {visit.totalAmount && (
              <><dt className="text-zinc-500">Сумма</dt><dd className="font-semibold">{Number(visit.totalAmount).toLocaleString("ru-RU")} ₽</dd></>
            )}
          </dl>
        </Card>

        {visit.status === "planned" && (
          <Card className="mt-6">
            <h2 className="mb-3 text-lg font-semibold">Подготовка</h2>
            <p className="mb-3 text-sm text-zinc-600">
              Когда вы на объекте — нажмите «Начать визит», после этого появятся секции для заполнения.
            </p>
            <form action={startVisitAction.bind(null, visit.id)}>
              <Button type="submit" className="h-12 w-full text-base">
                Начать визит
              </Button>
            </form>
          </Card>
        )}

        {visit.status === "in_progress" && (
          <div className="mt-6">
            <VisitInProgressEditorWrapper visitId={visit.id} visit={visit} />
          </div>
        )}

        {visit.status === "completed" && (
          <div className="mt-6 flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              {visit.pdfPath && (
                <a
                  href={`/api/files/${visit.pdfPath}?v=${visit.pdfGeneratedAt?.getTime() ?? 0}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="secondary">Скачать PDF</Button>
                </a>
              )}
              {canReopen && (
                <form action={reopenVisitAction.bind(null, visit.id)}>
                  <Button type="submit" variant="secondary">Редактировать</Button>
                </form>
              )}
            </div>
            <VisitReadOnlyView visit={visit} />
          </div>
        )}

        {visit.status === "canceled" && (
          <div className="mt-6"><Alert variant="info">Визит отменён.</Alert></div>
        )}

        {visit.status === "planned" && (
          <PlannedEditingSection
            visitId={visit.id}
            customerId={visit.pool.customer.id}
            poolId={visit.poolId}
            serviceUserId={visit.serviceUserId}
            scheduledAt={visit.scheduledAt}
            durationMinutes={visit.durationMinutes}
            notes={visit.notes ?? ""}
          />
        )}

        {(visit.status === "planned" || visit.status === "in_progress") && (
          <Card className="mt-6">
            <h2 className="mb-3 text-lg font-semibold">Отмена визита</h2>
            <form action={cancelVisitAction} className="flex flex-col gap-3">
              <input type="hidden" name="id" value={visit.id} />
              <textarea
                name="reason"
                rows={2}
                placeholder="Причина (необязательно)"
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
              />
              <div className="flex justify-end">
                <Button type="submit" variant="destructive">Отменить визит</Button>
              </div>
            </form>
          </Card>
        )}

        <div className="mt-6">
          <Link href="/service/calendar"><Button variant="secondary">← В календарь</Button></Link>
        </div>
      </PageContainer>
    </>
  );
}

async function PlannedEditingSection({
  visitId,
  customerId,
  poolId,
  serviceUserId,
  scheduledAt,
  durationMinutes,
  notes,
}: {
  visitId: string;
  customerId: string;
  poolId: string;
  serviceUserId: string;
  scheduledAt: Date;
  durationMinutes: number;
  notes: string;
}) {
  const [customers, serviceUsers] = await Promise.all([
    prisma.customer.findMany({
      orderBy: { fullName: "asc" },
      select: {
        id: true,
        fullName: true,
        pools: { orderBy: { name: "asc" }, select: { id: true, name: true } },
      },
    }),
    prisma.user.findMany({
      where: { role: { in: ["admin", "service"] }, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  async function checkAction(input: {
    serviceUserId: string;
    scheduledAt: string;
    durationMinutes: number;
    excludeVisitId: string;
  }) {
    "use server";
    return (
      await checkVisitConflicts({
        serviceUserId: input.serviceUserId,
        scheduledAt: new Date(input.scheduledAt),
        durationMinutes: input.durationMinutes,
        excludeVisitId: input.excludeVisitId,
      })
    ).map((c) => ({
      id: c.id,
      scheduledAt: c.scheduledAt.toISOString(),
      durationMinutes: c.durationMinutes,
      customerName: c.customerName,
      poolName: c.poolName,
    }));
  }

  return (
    <div className="mt-6">
      <h2 className="mb-3 text-lg font-semibold">Редактирование плана</h2>
      <VisitForm
        mode={{
          kind: "edit",
          visitId,
          updateAction: updateVisitAction,
          checkConflicts: checkAction,
        }}
        customers={customers}
        serviceUsers={serviceUsers}
        defaults={{
          customerId,
          poolId,
          serviceUserId,
          scheduledAt,
          durationMinutes,
          notes,
        }}
      />
    </div>
  );
}

async function VisitInProgressEditorWrapper({
  visitId,
  visit,
}: {
  visitId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  visit: any;
}) {
  const [questions, catalog] = await Promise.all([
    prisma.checklistQuestion.findMany({
      where: { active: true },
      orderBy: { order: "asc" },
    }),
    listActiveChemistryItems(),
  ]);

  const initialAnswers: Record<string, unknown> = {};
  for (const a of visit.checklistAnswers) {
    initialAnswers[a.questionId] = a.value;
  }

  const requiredQuestions = questions.filter((q) => q.required);
  const initialChecklistFilled = requiredQuestions.filter((q) => {
    const decoded = decodeChecklistValue(q.type, initialAnswers[q.id]);
    return !isAnswerEmpty(q.type, decoded);
  }).length;

  const works = visit.extraWorks.map((w: { id: string; name: string; price: { toString(): string } }) => ({
    id: w.id,
    name: w.name,
    price: w.price.toString(),
  }));
  const chemistry = visit.chemistry.map((c: {
    id: string;
    nameAtMoment: string;
    unitAtMoment: string;
    priceAtMoment: { toString(): string };
    qty: { toString(): string };
  }) => ({
    id: c.id,
    nameAtMoment: c.nameAtMoment,
    unitAtMoment: c.unitAtMoment,
    priceAtMoment: c.priceAtMoment.toString(),
    qty: c.qty.toString(),
  }));

  const worksSum = visit.extraWorks.reduce((s: number, w: { price: unknown }) => s + Number(w.price), 0);
  const chemSum = visit.chemistry.reduce(
    (s: number, c: { priceAtMoment: unknown; qty: unknown }) => s + Number(c.priceAtMoment) * Number(c.qty),
    0,
  );
  const hint = worksSum + chemSum;

  return (
    <VisitInProgressEditor
      visitId={visitId}
      questions={questions}
      initialAnswers={initialAnswers as Record<string, never>}
      photos={visit.photos}
      works={works}
      chemistry={chemistry}
      chemistryCatalog={catalog.map((c) => ({
        id: c.id,
        name: c.name,
        unit: c.unit,
        price: c.price.toString(),
      }))}
      initialTotalAmount={visit.totalAmount ? visit.totalAmount.toString() : null}
      initialChecklistFilled={initialChecklistFilled}
      totalRequired={requiredQuestions.length}
      hint={hint}
    />
  );
}
