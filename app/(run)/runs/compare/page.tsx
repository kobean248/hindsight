import { CompareLive } from "@/components/run/compare-live";
import { PageHeader } from "@/components/ui";

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ baseline?: string; transfer?: string }>;
}) {
  const { baseline, transfer } = await searchParams;
  return (
    <>
      <PageHeader title="Baseline vs transfer" subtitle="The same task before and after a lesson was available." />
      <CompareLive baselineId={baseline} transferId={transfer} />
    </>
  );
}
