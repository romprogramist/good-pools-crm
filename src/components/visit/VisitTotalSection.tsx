import { Card } from "@/components/Page";

export function VisitTotalSection({ total }: { total: number }) {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Сумма к оплате</h2>
        <div className="text-2xl font-bold">
          {total.toLocaleString("ru-RU")} ₽
        </div>
      </div>
      <p className="mt-2 text-sm text-zinc-500">
        Считается автоматически = доп.работы + химия. Для скидки добавь строку
        в «Доп.работы» с минусом, например «Скидка -500».
      </p>
    </Card>
  );
}
