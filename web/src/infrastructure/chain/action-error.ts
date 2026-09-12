/** User-safe action feedback; raw wallet/RPC errors never reach diagnostics or UI. */
export class ActionError extends Error {}
