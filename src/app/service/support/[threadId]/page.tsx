import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { prisma } from "@/lib/prisma";
import { PageContainer, PageHeader } from "@/components/Page";
import { ChatRoom } from "@/components/chat/ChatRoom";
import { loadThreadMessages, markThreadRead } from "@/lib/chat";

export default async function ServiceSupportThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const session = await auth();
  if (
    !session?.user ||
    (session.user.role !== "admin" && session.user.role !== "service")
  ) {
    redirect("/login");
  }

  const { threadId } = await params;
  const thread = await prisma.chatThread.findUnique({
    where: { id: threadId },
    include: { customer: { select: { fullName: true } } },
  });
  if (!thread) notFound();

  await markThreadRead(threadId, session.user.role);
  const messages = await loadThreadMessages(threadId);

  return (
    <>
      <Header />
      <PageContainer>
        <PageHeader
          title={`Поддержка — ${thread.customer.fullName}`}
          subtitle="Чат с клиентом"
          actions={
            <Link
              href="/service/support"
              className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
            >
              ← Ко всем обращениям
            </Link>
          }
        />
        <ChatRoom
          threadId={threadId}
          initialMessages={messages}
          currentUserId={session.user.id}
        />
      </PageContainer>
    </>
  );
}
