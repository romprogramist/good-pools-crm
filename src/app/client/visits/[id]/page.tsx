import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { PageContainer, PageHeader, Alert } from "@/components/Page";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { VisitReadOnlyView } from "@/components/visit/VisitReadOnlyView";

type Params = Promise<{ id: string }>;

export default async function ClientVisitPage({ params }: { params: Params }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user || session.user.role !== "client") {
    redirect("/");
  }

  const visit = await prisma.visit.findUnique({
    where: { id },
    include: {
      pool: { include: { customer: true } },
      serviceUser: true,
      checklistAnswers: { include: { question: true } },
      photos: { orderBy: { uploadedAt: "asc" } },
      extraWorks: { orderBy: { order: "asc" } },
      chemistry: { orderBy: { order: "asc" } },
    },
  });

  if (!visit) notFound();
  if (visit.pool.customer.userId !== session.user.id) {
    redirect("/client?error=" + encodeURIComponent("Доступ запрещён"));
  }

  if (visit.status !== "completed") {
    return (
      <>
        <Header />
        <PageContainer size="narrow">
          <PageHeader title="Визит" subtitle={visit.pool.name} />
          <div className="mt-6">
            <Alert variant="info">
              Отчёт ещё не готов — визит {visit.status === "canceled" ? "отменён" : "в процессе"}.
            </Alert>
          </div>
          <div className="mt-4">
            <Link href="/client/visits">
              <Button variant="secondary">← К списку визитов</Button>
            </Link>
          </div>
        </PageContainer>
      </>
    );
  }

  return (
    <>
      <Header />
      <PageContainer size="narrow">
        <PageHeader title="Отчёт о визите" subtitle={visit.pool.name} />

        {visit.pdfPath && (
          <div className="mt-4">
            <a
              href={`/api/files/${visit.pdfPath}?v=${visit.pdfGeneratedAt?.getTime() ?? 0}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button>Скачать PDF</Button>
            </a>
          </div>
        )}

        <div className="mt-6">
          <VisitReadOnlyView visit={visit} />
        </div>

        <div className="mt-6">
          <Link href="/client/visits">
            <Button variant="secondary">← К списку визитов</Button>
          </Link>
        </div>
      </PageContainer>
    </>
  );
}
