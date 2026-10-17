export class LedgerError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

export function httpError(error: unknown): Response {
  if (error instanceof LedgerError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : "internal error";
  console.error(error);
  return Response.json({ error: message }, { status: 500 });
}
