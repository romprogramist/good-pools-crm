"use server";

import { randomBytes } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendInviteEmail } from "@/lib/email";
import { logActivity } from "@/lib/activity";
import type { Role } from "@prisma/client";

const INVITE_TTL_DAYS = 7;

const StaffSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
});

const ClientSchema = StaffSchema.extend({
  legalInfo: z.string().trim().max(2000).optional().or(z.literal("")),
});

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    throw new Error("Доступ запрещён");
  }
  return session.user;
}

function generateToken() {
  return randomBytes(32).toString("base64url");
}

function backWithError(role: string, error: string, kind?: string): never {
  const params = new URLSearchParams();
  if (role) params.set("role", role);
  if (kind) params.set("new", kind);
  params.set("error", error);
  redirect(`/admin/users?${params.toString()}`);
}

function backWithOk(role: string, ok: string): never {
  const params = new URLSearchParams();
  if (role) params.set("role", role);
  params.set("ok", ok);
  redirect(`/admin/users?${params.toString()}`);
}

type CreateResult =
  | { ok: true; userId: string }
  | { ok: false; error: string };

async function createInvitedUser(opts: {
  email: string;
  name: string;
  phone?: string;
  role: Role;
  actorId: string;
}): Promise<CreateResult> {
  const exists = await prisma.user.findUnique({ where: { email: opts.email } });
  if (exists) {
    return { ok: false, error: "Пользователь с таким email уже существует" };
  }

  const token = generateToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

  const user = await prisma.user.create({
    data: {
      email: opts.email,
      name: opts.name,
      phone: opts.phone || null,
      role: opts.role,
      inviteTokens: { create: { token, expiresAt } },
    },
  });

  await sendInviteEmail({ to: opts.email, name: opts.name, role: opts.role, token });

  await logActivity({
    actorId: opts.actorId,
    action: "user.create",
    entityType: "User",
    entityId: user.id,
    diff: { role: opts.role, email: opts.email, name: opts.name },
  });

  return { ok: true, userId: user.id };
}

export async function createAdminAction(formData: FormData) {
  const actor = await requireAdmin();
  const parsed = StaffSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
  });
  if (!parsed.success) backWithError("admin", "Проверьте поля формы", "admin");

  const result = await createInvitedUser({
    ...parsed.data,
    phone: parsed.data.phone || undefined,
    role: "admin",
    actorId: actor.id,
  });
  if (!result.ok) backWithError("admin", result.error, "admin");

  revalidatePath("/admin/users");
  backWithOk("admin", "Приглашение отправлено");
}

export async function createServiceAction(formData: FormData) {
  const actor = await requireAdmin();
  const parsed = StaffSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
  });
  if (!parsed.success) backWithError("service", "Проверьте поля формы", "service");

  const result = await createInvitedUser({
    ...parsed.data,
    phone: parsed.data.phone || undefined,
    role: "service",
    actorId: actor.id,
  });
  if (!result.ok) backWithError("service", result.error, "service");

  revalidatePath("/admin/users");
  backWithOk("service", "Приглашение отправлено");
}

export async function createClientAction(formData: FormData) {
  const actor = await requireAdmin();
  const parsed = ClientSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    legalInfo: formData.get("legalInfo"),
  });
  if (!parsed.success) backWithError("client", "Проверьте поля формы", "client");

  const exists = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (exists) backWithError("client", "Пользователь с таким email уже существует", "client");

  const token = generateToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

  const user = await prisma.user.create({
    data: {
      email: parsed.data.email,
      name: parsed.data.name,
      phone: parsed.data.phone || null,
      role: "client",
      inviteTokens: { create: { token, expiresAt } },
      customer: {
        create: {
          fullName: parsed.data.name,
          email: parsed.data.email,
          phone: parsed.data.phone || null,
          legalInfo: parsed.data.legalInfo || null,
        },
      },
    },
  });

  await sendInviteEmail({ to: parsed.data.email, name: parsed.data.name, role: "client", token });

  await logActivity({
    actorId: actor.id,
    action: "user.create",
    entityType: "User",
    entityId: user.id,
    diff: { role: "client", email: parsed.data.email, name: parsed.data.name },
  });

  revalidatePath("/admin/users");
  backWithOk("client", "Приглашение отправлено");
}

export async function deactivateUserAction(formData: FormData) {
  const actor = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) backWithError("all", "Не указан userId");
  if (userId === actor.id) backWithError("all", "Нельзя деактивировать самого себя");

  await prisma.user.update({ where: { id: userId }, data: { active: false } });

  await logActivity({
    actorId: actor.id,
    action: "user.deactivate",
    entityType: "User",
    entityId: userId,
  });

  revalidatePath("/admin/users");
  backWithOk("all", "Пользователь деактивирован");
}

export async function activateUserAction(formData: FormData) {
  const actor = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) backWithError("all", "Не указан userId");

  await prisma.user.update({ where: { id: userId }, data: { active: true } });

  await logActivity({
    actorId: actor.id,
    action: "user.activate",
    entityType: "User",
    entityId: userId,
  });

  revalidatePath("/admin/users");
  backWithOk("all", "Пользователь активирован");
}

export async function resendInviteAction(formData: FormData) {
  const actor = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) backWithError("all", "Не указан userId");

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) backWithError("all", "Пользователь не найден");
  if (user.passwordHash) backWithError("all", "Пользователь уже установил пароль");

  await prisma.inviteToken.deleteMany({ where: { userId, usedAt: null } });
  const token = generateToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
  await prisma.inviteToken.create({ data: { token, userId, expiresAt } });

  await sendInviteEmail({
    to: user.email,
    name: user.name ?? user.email,
    role: user.role,
    token,
  });

  await logActivity({
    actorId: actor.id,
    action: "user.invite_resend",
    entityType: "User",
    entityId: userId,
  });

  revalidatePath("/admin/users");
  backWithOk("all", "Инвайт отправлен повторно");
}
