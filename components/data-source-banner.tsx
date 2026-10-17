import { DATA_SOURCE } from "@/lib/ui/config";

export function DataSourceBanner() {
  if (DATA_SOURCE === "live") return null;
  return (
    <div className="border-b border-warn/30 bg-warn-bg px-4 py-1.5 text-center text-xs text-warn">
      Test double: runs here are scripted in-process fakes, not live agent runs. Lessons are the 17 notes from
      the 17 Oct pilot. Set <code className="font-mono">NEXT_PUBLIC_LEDGER_SOURCE=live</code> to read the real API.
    </div>
  );
}
