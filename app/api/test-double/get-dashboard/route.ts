import { json } from "@/lib/http/respond";
import { testDoubleDisabled } from "@/lib/test-double/guard";
import { getDashboard } from "@/lib/test-double/store";

export async function GET() {
  return testDoubleDisabled() ?? json(getDashboard());
}
