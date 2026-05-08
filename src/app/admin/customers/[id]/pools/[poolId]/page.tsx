import { Header } from "@/components/Header";
import { PageContainer } from "@/components/Page";
import { PoolDetail } from "@/components/pools/PoolDetail";

export default async function AdminPoolPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; poolId: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { id, poolId } = await params;
  const sp = await searchParams;
  return (
    <>
      <Header />
      <PageContainer>
        <PoolDetail
          scope="admin"
          customerId={id}
          poolId={poolId}
          ok={sp.ok}
          error={sp.error}
        />
      </PageContainer>
    </>
  );
}
