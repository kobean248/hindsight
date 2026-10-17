import type { RunStatus, VerificationStatus } from "@/lib/ui/contracts";
import { VERIFICATION_LABEL } from "@/lib/ui/format";
import { Badge } from "./ui";

export function RunStatusBadge({ status }: { status: RunStatus }) {
  const tone =
    status === "succeeded" ? "ok" : status === "failed" || status === "timed_out" ? "bad" : status === "cancelled" ? "neutral" : "info";
  return <Badge tone={tone}>{status.replace("_", " ")}</Badge>;
}

/** The evaluator's verdict — the only thing that counts as success (§03). */
export function VerdictBadge({ verified }: { verified: boolean | null }) {
  if (verified === null) return <Badge>unverified</Badge>;
  return verified ? <Badge tone="ok">evaluator: pass</Badge> : <Badge tone="bad">evaluator: fail</Badge>;
}

export function VerificationBadge({ status }: { status: VerificationStatus }) {
  const tone =
    status === "verified_success" ? "ok" : status === "verified_failure" ? "bad" : status === "unrelated_failure" ? "warn" : "neutral";
  return <Badge tone={tone}>{VERIFICATION_LABEL[status]}</Badge>;
}

/** Agent said done, evaluator said no: the pilot's 55% failure mode. */
export function FalseSuccessBadge() {
  return <Badge tone="warn">claimed done, not verified</Badge>;
}
