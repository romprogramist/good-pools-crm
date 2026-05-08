import { Header } from "@/components/Header";
import { PageContainer } from "@/components/Page";
import { CustomerDetail } from "@/components/customers/CustomerDetail";

export default async function ServiceCustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string; ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  return (
    <>
      <Header />
      <PageContainer>
        <CustomerDetail
          scope="service"
          customerId={id}
          edit={sp.edit === "1"}
          ok={sp.ok}
          error={sp.error}
        />
      </PageContainer>
    </>
  );
}
