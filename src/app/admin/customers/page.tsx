import { Header } from "@/components/Header";
import { PageContainer } from "@/components/Page";
import { CustomersList } from "@/components/customers/CustomersList";

export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  return (
    <>
      <Header />
      <PageContainer>
        <CustomersList scope="admin" q={params.q} />
      </PageContainer>
    </>
  );
}
