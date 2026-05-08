import { config } from "dotenv";
import { PrismaClient, ChecklistQuestionType } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

type SeedQuestion = {
  label: string;
  type: ChecklistQuestionType;
  required: boolean;
  unit?: string;
  options?: string[];
};

const QUESTIONS: SeedQuestion[] = [
  { label: "УРОВЕНЬ pH", type: "number", required: true },
  { label: "УРОВЕНЬ СВОБОДНОГО ХЛОРА", type: "number", required: true, unit: "мг/л" },
  { label: "УРОВЕНЬ СВЯЗАННОГО ХЛОРА", type: "number", required: true, unit: "мг/л" },
  { label: "УРОВЕНЬ ЩЁЛОЧНОСТИ", type: "number", required: true, unit: "мг/л" },
  { label: "СОДЕРЖАНИЕ СОЛИ", type: "number", required: false, unit: "г/л" },
  { label: "УРОВЕНЬ ЦИАНУРОВОЙ КИСЛОТЫ", type: "number", required: false, unit: "мг/л" },
  { label: "ПРОМЫВКА ФИЛЬТРА", type: "bool", required: true },
  { label: "ДАВЛЕНИЕ В СИСТЕМЕ ФИЛЬТРАЦИИ", type: "number", required: true, unit: "бар" },
  {
    label: "РАБОТА НАСОСНЫХ АГРЕГАТОВ",
    type: "multi_select",
    required: true,
    options: ["НОРМАЛЬНАЯ", "ПОСТОРОННИЕ ШУМЫ", "ПЕРЕГРЕВ", "НЕОБХОДИМ РЕМОНТ"],
  },
  {
    label: "СОСТОЯНИЕ ДОННОГО ПЫЛЕСОСА",
    type: "single_select",
    required: true,
    options: ["ИСПРАВЕН", "ТРЕБУЕТ РЕМОНТА ИЛИ ЗАМЕНЫ"],
  },
  {
    label: "РАБОТА ЭЛЕКТРИЧЕСКОГО ЩИТА",
    type: "single_select",
    required: true,
    options: ["НОРМАЛЬНО", "ТРЕБУЕТ ВНИМАНИЯ"],
  },
  {
    label: "РАБОТА АВТОМАТИЧЕСКОГО ДОЛИВА ВОДЫ",
    type: "single_select",
    required: true,
    options: ["НОРМАЛЬНО", "ТРЕБУЕТ НАСТРОЙКИ", "НЕИСПРАВНО", "ОТКЛЮЧЕНО"],
  },
  {
    label: "ПОДОГРЕВ В БАССЕЙНЕ",
    type: "single_select",
    required: true,
    options: ["НОРМАЛЬНО", "ТРЕБУЕТ ВНИМАНИЯ", "НЕИСПРАВНО"],
  },
  {
    label: "ПОДСВЕТКА БАССЕЙНА",
    type: "single_select",
    required: true,
    options: ["ИСПРАВНА", "ТРЕБУЕТ РЕМОНТА"],
  },
  {
    label: "РАБОТА АТТРАКЦИОНОВ",
    type: "single_select",
    required: true,
    options: ["НОРМАЛЬНО", "ТРЕБУЕТ ВНИМАНИЯ", "НЕИСПРАВНО"],
  },
  {
    label: "СОСТОЯНИЕ ТЕПЛОСБЕРЕГАЮЩЕГО ПОКРЫТИЯ",
    type: "single_select",
    required: true,
    options: ["НОРМАЛЬНО", "ТРЕБУЕТ ВНИМАНИЯ", "НЕИСПРАВНО"],
  },
  {
    label: "АВТОМАТИЧЕСКОЕ ДОЗИРОВАНИЕ РЕАГЕНТОВ",
    type: "single_select",
    required: true,
    options: ["РАБОТАЕТ", "ТРЕБУЕТ ОБСЛУЖИВАНИЯ"],
  },
  {
    label: "СОСТОЯНИЕ ЗАКЛАДНЫХ ЭЛЕМЕНТОВ",
    type: "single_select",
    required: true,
    options: ["НОРМАЛЬНО", "ТРЕБУЕТ ВНИМАНИЯ"],
  },
  {
    label: "УБОРКА ЧАШИ БАССЕЙНА",
    type: "single_select",
    required: true,
    options: ["ВЫПОЛНЕНА", "НЕ ТРЕБУЕТСЯ"],
  },
  {
    label: "УБОРКА БОРТОВОГО КАМНЯ",
    type: "single_select",
    required: true,
    options: ["ВЫПОЛНЕНА", "НЕ ТРЕБУЕТСЯ"],
  },
  {
    label: "УБОРКА ТЕХНИЧЕСКОГО ПОМЕЩЕНИЯ",
    type: "single_select",
    required: true,
    options: ["ВЫПОЛНЕНА", "НЕ ТРЕБУЕТСЯ"],
  },
  {
    label: "СОСТОЯНИЕ ОБЛИЦОВОЧНЫХ ПОКРЫТИЙ",
    type: "single_select",
    required: true,
    options: ["НОРМАЛЬНО", "ТРЕБУЕТ ВНИМАНИЯ"],
  },
  {
    label: "СОСТОЯНИЕ ПЕРЕЛИВНОЙ ЁМКОСТИ",
    type: "single_select",
    required: true,
    options: ["НОРМАЛЬНО", "ТРЕБУЕТ ВНИМАНИЯ"],
  },
  { label: "РУЧНОЕ ВНЕСЕНИЕ ХИМИЧЕСКИХ РЕАГЕНТОВ", type: "text", required: true },
  {
    label: "ЗАПАС ХИМИЧЕСКИХ РЕАГЕНТОВ",
    type: "single_select",
    required: true,
    options: ["ДОСТАТОЧНО", "ТРЕБУЕТ ПОПОЛНЕНИЯ"],
  },
];

async function main() {
  const existing = await prisma.checklistQuestion.count();
  if (existing > 0) {
    console.log(`⏭  В базе уже ${existing} вопросов чек-листа. Сидер пропущен.`);
    return;
  }

  for (let i = 0; i < QUESTIONS.length; i++) {
    const q = QUESTIONS[i];
    await prisma.checklistQuestion.create({
      data: {
        order: i + 1,
        type: q.type,
        label: q.label,
        required: q.required,
        unit: q.unit ?? null,
        options: q.options ?? undefined,
      },
    });
  }
  console.log(`✓ Засеяно ${QUESTIONS.length} вопросов чек-листа.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
