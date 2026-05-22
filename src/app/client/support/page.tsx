import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { prisma } from "@/lib/prisma";
import { PageContainer, PageHeader, Card } from "@/components/Page";
import { ChatRoom } from "@/components/chat/ChatRoom";
import {
  getOrCreateClientThread,
  loadThreadMessages,
  markThreadRead,
} from "@/lib/chat";

export default async function ClientSupportPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "client") redirect("/");

  const customer = await prisma.customer.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });

  return (
    <>
      <Header />
      <PageContainer>
        <PageHeader
          title="Поддержка"
          subtitle="Задайте вопрос — сервисник ответит здесь же"
        />

        {!customer ? (
          <Card className="mt-6">
            <p className="text-sm text-zinc-500">
              Ваш профиль ещё не настроен. Свяжитесь с компанией.
            </p>
          </Card>
        ) : (
          <ClientChat customerId={customer.id} userId={session.user.id} />
        )}
      </PageContainer>
    </>
  );
}

async function ClientChat({
  customerId,
  userId,
}: {
  customerId: string;
  userId: string;
}) {
  const thread = await getOrCreateClientThread(customerId);
  await markThreadRead(thread.id, "client");
  const messages = await loadThreadMessages(thread.id);

  return (
    <ChatRoom
      threadId={thread.id}
      initialMessages={messages}
      currentUserId={userId}
    />
  );
}
