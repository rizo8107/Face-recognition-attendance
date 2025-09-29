import PocketBase from 'pocketbase';

// PocketBase client singleton for browser usage
// NOTE: Admin auth endpoint appears unavailable (404 via reverse proxy). We avoid admin auth on the client.

let pb: PocketBase | null = null;

export function getPb(): PocketBase {
  if (!pb) {
    const url = process.env.PB_URL || 'https://app-pocketbase.9krcxo.easypanel.host';
    pb = new PocketBase(url);
    // Disable auto-cancellation globally to avoid aborted overlapping requests in React
    try { (pb as any).autoCancellation?.(false); } catch {}
  }
  return pb;
}

// No-op to keep compatibility with call sites. Collections must be created and rules configured via PB Admin UI.
export async function ensureAdminAuth(): Promise<void> {
  return;
}

export function clearAuth() {
  if (pb) pb.authStore.clear();
}
