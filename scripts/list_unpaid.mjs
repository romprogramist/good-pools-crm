import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const rows = await p.visit.findMany({
  where: { status: "completed", paymentStatus: "unpaid" },
  select: {
    id: true,
    scheduledAt: true,
    totalAmount: true,
    pool: { select: { name: true, customer: { select: { fullName: true } } } },
  },
  orderBy: { scheduledAt: "desc" },
});
for (const v of rows) {
  console.log(
    `${v.id}  ${v.pool.customer.fullName}  /  ${v.pool.name}  /  ${v.scheduledAt.toISOString().slice(0,10)}  /  ${v.totalAmount} ₽`,
  );
}
console.log(`---\nTOTAL: ${rows.length} визитов, ${rows.reduce((s,v)=>s+Number(v.totalAmount||0),0)} ₽`);
await p.$disconnect();
