import { notFound } from "next/navigation";
import { loadRecorded } from "@/lib/recorded";
import { when } from "@/lib/ui/format";
import { CompareView } from "@/components/run/compare-view";
import { PageHeader } from "@/components/ui";

export default async function RecordedPairPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const pair = await loadRecorded(name);
  if (!pair) notFound();
  return (
    <>
      <div role="note" className="mb-6 rounded-lg border-2 border-warn bg-warn-bg px-4 py-3 text-sm text-warn">
        <p className="font-semibold">Recorded run, not live.</p>
        <p className="mt-1">
          Captured {when(pair.captured_at)} from {pair.source === "live" ? "the live API" : "the scripted test double"} (
          <code className="font-mono">{pair.api_base}</code>). These are the real stored traces and evaluator results from that
          rehearsal, replayed read-only.
          {pair.note ? ` ${pair.note}` : ""}
        </p>
      </div>
      <PageHeader title={`Recorded pair: ${pair.name}`} subtitle={`Task ${pair.baseline.run.task_id}`} />
      <CompareView baseline={pair.baseline} transfer={pair.transfer} linkRuns={false} />
    </>
  );
}
