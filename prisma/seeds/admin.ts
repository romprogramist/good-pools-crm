import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../../src/lib/prisma";

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME?.trim() || "Администратор";

  if (!email || !password) {
    console.error("[seed:admin] ADMIN_EMAIL и ADMIN_PASSWORD обязательны в .env");
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`[seed:admin] Пользователь ${email} уже существует — пропускаю`);
    return;
  }

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

  console.log(`[seed:admin] Создан админ ${email}`);
}

main()
  .catch((err) => {
    console.error("[seed:admin] Ошибка:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
