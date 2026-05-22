import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { PageContainer, PageHeader } from "@/components/Page";
import { ThreadList } from "@/components/chat/ThreadList";
import { listStaffThreads } from "@/lib/chat";

export default async function ServiceSupportPage() {
  const session = await auth();
  if (
    !session?.user ||
    (session.user.role !== "admin" && session.user.role !== "service")
  ) {
    redirect("/login");
  }

  const threads = await listStaffThreads();
  const unread = threads.reduce((s, t) => s + t.unread, 0);

  return (
    <>
      <Header />
      <PageContainer>
        <PageHeader
          title="Поддержка"
          subtitle={
            unread > 0
              ? `Непрочитанных сообщений: ${unread}`
              : "Обращения клиентов"
          }
          actions={
            <Link
              href="/service"
              className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
            >
              ← В кабинет
            </Link>
          }
        />
        <ThreadList threads={threads} basePath="/service/support" />
      </PageContainer>
    </>
  );
}
