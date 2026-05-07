"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isSetupComplete } from "@/lib/setup";

const SetupSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(200),
});

export async function setupAction(formData: FormData) {
  if (await isSetupComplete()) {
    throw new Error("Setup already complete");
  }

  const parsed = SetupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    throw new Error("Некорректные данные формы");
  }

  const { name, email, password } = parsed.data;
  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.user.create({
    data: {
      email,
      name,
      passwordHash,
      role: "admin",
      emailVerified: new Date(),
    },
  });

  redirect("/login?setup=ok");
}
