import { prisma } from "@/lib/prisma";
import { enqueuePush } from "./enqueue";
import { getCustomerUserId, listAdminAndServiceRecipients } from "./recipients";

async function loadEquipment(equipmentId: string) {
  return prisma.equipment.findUnique({
    where: { id: equipmentId },
    include: {
      pool: { select: { id: true, customerId: true, name: true } },
    },
  });
}

export async function sendWarrantyReminder(equipmentId: string, daysLeft = 14): Promise<void> {
  const eq = await loadEquipment(equipmentId);
  if (!eq) return;
  const userId = await getCustomerUserId(eq.pool.customerId);
  if (!userId) return;

  await enqueuePush("equipment_warranty_expiring", [{ userId }], {
    equipmentId,
    poolId: eq.pool.id,
    title: eq.typeName,
    daysLeft,
    url: `/client/customers/${eq.pool.customerId}/pools/${eq.pool.id}`,
  });
}

export async function sendRegulationReminder(equipmentId: string, daysLeft = 7): Promise<void> {
  const eq = await loadEquipment(equipmentId);
  if (!eq) return;

  // Клиенту
  const clientUserId = await getCustomerUserId(eq.pool.customerId);
  if (clientUserId) {
    await enqueuePush("equipment_regulation_due", [{ userId: clientUserId }], {
      equipmentId,
      poolId: eq.pool.id,
      title: eq.typeName,
      daysLeft,
      url: `/client/customers/${eq.pool.customerId}/pools/${eq.pool.id}`,
    });
  }

  // Сервисникам + админам
  const staff = await listAdminAndServiceRecipients();
  if (staff.length > 0) {
    await enqueuePush("equipment_regulation_due", staff, {
      equipmentId,
      poolId: eq.pool.id,
      title: eq.typeName,
      daysLeft,
      url: `/service/customers/${eq.pool.customerId}/pools/${eq.pool.id}`,
    });
  }
}
