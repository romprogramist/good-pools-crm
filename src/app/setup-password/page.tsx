import { Header } from "@/components/Header";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageContainer, Card, FormField, Alert } from "@/components/Page";
import { setupPasswordAction } from "./actions";

export default async function SetupPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const params = await searchParams;
  const token = params.token ?? "";
  const error = params.error;

  const invite = token
    ? await prisma.inviteToken.findUnique({
        where: { token },
        include: { user: { select: { email: true, name: true, role: true } } },
      })
    : null;

  const valid =
    !!invite && !invite.usedAt && invite.expiresAt > new Date() && !!invite.user;

  return (
    <>
      <Header />
      <PageContainer size="narrow" className="flex flex-col justify-center">
        <Card>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            Установка пароля
          </h1>

          {!valid ? (
            <div className="mt-5">
              <Alert variant="error">
                Ссылка недействительна или истекла. Попроси администратора
                отправить новое приглашение.
              </Alert>
            </div>
          ) : (
            <>
              <p className="mt-1 text-sm text-zinc-500">
                Здравствуйте, {invite!.user.name ?? invite!.user.email}. Придумайте
                пароль для входа.
              </p>

              {error && (
                <div className="mt-5">
                  <Alert variant="error">{decodeURIComponent(error)}</Alert>
                </div>
              )}

              <form action={setupPasswordAction} className="mt-6 space-y-4">
                <input type="hidden" name="token" value={token} />
                <FormField
                  label="Пароль"
                  htmlFor="password"
                  hint="Минимум 8 символов"
                >
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className="h-11 text-base"
                  />
                </FormField>
                <FormField label="Подтверждение пароля" htmlFor="confirm">
                  <Input
                    id="confirm"
                    name="confirm"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className="h-11 text-base"
                  />
                </FormField>
                <Button
                  type="submit"
                  className="h-11 w-full bg-teal-600 px-5 text-sm font-semibold text-white shadow-sm hover:bg-teal-700"
                >
                  Установить пароль и войти
                </Button>
              </form>
            </>
          )}
        </Card>
      </PageContainer>
    </>
  );
}
