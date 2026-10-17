import { memoryStore } from "./memory";
import { supabaseStore } from "./supabase-store";

export type LedgerStore = typeof supabaseStore;

export function getStore(): LedgerStore {
  if (process.env.LEDGER_STORE === "memory") return memoryStore;
  return supabaseStore;
}

export function resetMemoryStore(): void {
  memoryStore.reset();
}
