// Error type shared by the task-manager engine and data layer. The old HTTP
// bridge's handleApi/jsonError wrappers are gone — data/core.ts's native()
// converts these into FlowBridgeError for the pages instead.
export class ApiHttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
