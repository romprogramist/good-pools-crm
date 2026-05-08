"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { signIn } from "@/lib/auth";
import { logActivity } from "@/lib/activity";

const Schema = z
  .object({
    token: z.string().min(10),
    password: z.string().min(8).max(200),
    confirm: z.string().min(8).max(200),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Пароли не совпадают",
    path: ["confirm"],
  });

export async function setupPasswordAction(formData: FormData) {
  const parsed = Schema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });

  if (!parsed.success) {
    const token = String(formData.get("token") ?? "");
    const msg = parsed.error.issues[0]?.message ?? "Проверьте поля формы";
    redirect(`/setup-password?token=${token}&error=${encodeURIComponent(msg)}`);
  }

  const invite = await prisma.inviteToken.findUnique({
    where: { token: parsed.data.token },
    include: { user: true },
  });

  if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
    redirect(`/setup-password?error=${encodeURIComponent("Ссылка недействительна или истекла")}`);
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: invite.userId },
      data: { passwordHash, emailVerified: new Date() },
    }),
    prisma.inviteToken.update({
      where: { token: invite.token },
      data: { usedAt: new Date() },
    }),
    prisma.inviteToken.deleteMany({
      where: { userId: invite.userId, usedAt: null, NOT: { token: invite.token } },
    }),
  ]);

  await logActivity({
    actorId: invite.userId,
    action: "user.password_set",
    entityType: "User",
    entityId: invite.userId,
  });

  await signIn("credentials", {
    email: invite.user.email,
    password: parsed.data.password,
    redirect: false,
  });

  if (invite.user.role === "admin") redirect("/admin");
  if (invite.user.role === "service") redirect("/service");
  redirect("/client");
}
