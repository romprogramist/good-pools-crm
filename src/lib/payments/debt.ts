/**
 * Заглушка проверки долга клиента.
 * В этапе 7 всегда возвращает false — клиент может отправить онлайн-заявку.
 * Этап 13 переписывает реализацию: сумма всех Visit со статусом unpaid.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function hasUnpaidDebt(customerId: string): Promise<boolean> {
  return false;
}
