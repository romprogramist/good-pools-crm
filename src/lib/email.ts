import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT ?? 1025),
  secure: process.env.SMTP_SECURE === "true",
  auth: process.env.SMTP_USER
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    : undefined,
});

export async function sendInviteEmail(opts: {
  to: string;
  name: string;
  role: "admin" | "service" | "client";
  token: string;
}) {
  const url = `${process.env.APP_URL}/setup-password?token=${opts.token}`;
  const roleLabel =
    opts.role === "admin" ? "администратора" : opts.role === "service" ? "сервисника" : "клиента";

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: opts.to,
    subject: "Приглашение в CRM «Хорошие Бассейны»",
    text: `Здравствуйте, ${opts.name}!\n\nВас пригласили в CRM «Хорошие Бассейны» в роли ${roleLabel}.\n\nЧтобы установить пароль и войти, перейдите по ссылке:\n${url}\n\nСсылка действует 7 дней.`,
    html: `<p>Здравствуйте, <b>${escapeHtml(opts.name)}</b>!</p>
<p>Вас пригласили в CRM «Хорошие Бассейны» в роли <b>${roleLabel}</b>.</p>
<p>Чтобы установить пароль и войти, перейдите по ссылке:</p>
<p><a href="${url}">${url}</a></p>
<p>Ссылка действует 7 дней.</p>`,
  });
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
