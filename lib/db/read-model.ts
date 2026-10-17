import { getStore } from "./store";
import type { Dashboard, DashboardFilter } from "./types";

export async function getDashboard(filter?: DashboardFilter): Promise<Dashboard> {
  return getStore().dashboard(filter);
}
