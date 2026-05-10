import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const ITEMS = [
  { name: "Хлор гранулированный", unit: "кг", price: 800 },
  { name: "Альгицид", unit: "л", price: 600 },
  { name: "pH-минус", unit: "кг", price: 400 },
  { name: "pH-плюс", unit: "кг", price: 400 },
  { name: "Коагулянт", unit: "л", price: 700 },
];

async function main() {
  for (const item of ITEMS) {
    const existing = await prisma.chemistryItem.findFirst({
      where: { name: item.name },
    });
    if (existing) {
      console.log(`= ${item.name} уже существует, пропускаем`);
      continue;
    }
    await prisma.chemistryItem.create({
      data: { name: item.name, unit: item.unit, price: item.price, active: true },
    });
    console.log(`+ ${item.name} (${item.unit}, ${item.price} ₽)`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
