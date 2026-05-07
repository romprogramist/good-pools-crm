import { prisma } from "./prisma";

export async function isSetupComplete(): Promise<boolean> {
  const adminCount = await prisma.user.count({ where: { role: "admin" } });
  return adminCount > 0;
}
