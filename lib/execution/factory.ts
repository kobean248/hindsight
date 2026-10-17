import { TestExecutionAdapter, type TestExecutionAdapterOptions } from "./test-adapter";
import type { ExecutionAdapter, RunStore } from "./types";

export const ADAPTER_KINDS = ["test", "freestyle"] as const;
export type AdapterKind = (typeof ADAPTER_KINDS)[number];

export interface CreateExecutionAdapterOptions {
  store: RunStore;
  /** Overrides `EXECUTION_ADAPTER`. */
  kind?: AdapterKind;
  test?: TestExecutionAdapterOptions;
  env?: Record<string, string | undefined>;
}

type AdapterFactory = (options: CreateExecutionAdapterOptions) => ExecutionAdapter;

const FACTORIES: Record<AdapterKind, AdapterFactory> = {
  test: ({ store, test }) => new TestExecutionAdapter(store, test),
  freestyle: () => {
    throw new Error(
      'EXECUTION_ADAPTER=freestyle is not yet implemented (FreestyleExecutionAdapter is pending in Lane B). Use EXECUTION_ADAPTER=test.',
    );
  },
};

export function resolveAdapterKind(value: string | undefined): AdapterKind {
  const kind = (value ?? "test").trim().toLowerCase();
  if ((ADAPTER_KINDS as readonly string[]).includes(kind)) return kind as AdapterKind;
  throw new Error(
    `Invalid EXECUTION_ADAPTER "${value}": expected one of ${ADAPTER_KINDS.join(", ")}`,
  );
}

/** Picks the adapter from `EXECUTION_ADAPTER=test|freestyle` (default `test`). */
export function createExecutionAdapter(options: CreateExecutionAdapterOptions): ExecutionAdapter {
  const env = options.env ?? process.env;
  const kind = options.kind ?? resolveAdapterKind(env.EXECUTION_ADAPTER);
  return FACTORIES[kind](options);
}
