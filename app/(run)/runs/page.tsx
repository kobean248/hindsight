import { RunsIndex } from "@/components/run/runs-index";
import { PageHeader } from "@/components/ui";

export default function RunsPage() {
  return (
    <>
      <PageHeader title="Runs" subtitle="Every agent run, newest first. Open one to inspect its trace and evaluator evidence." />
      <RunsIndex />
    </>
  );
}
