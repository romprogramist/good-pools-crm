import { Header } from "@/components/Header";

export default function Home() {
  return (
    <>
      <Header />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center px-4 py-16 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
          CRM «Хорошие Бассейны»
        </h1>
        <p className="mt-4 max-w-md text-zinc-600">
          Внутренняя система обслуживания бассейнов. Доступ только для сотрудников
          и клиентов компании.
        </p>
      </main>
    </>
  );
}
