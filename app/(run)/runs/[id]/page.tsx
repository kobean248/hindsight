import { RunInspector } from "@/components/run/run-inspector";

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RunInspector id={decodeURIComponent(id)} />;
}
