import { createLocalStorageAdapter } from "@assistant-ui/core/react";
import type { RemoteThreadListAdapter } from "@assistant-ui/react";
import { idbStorage } from "./idb-storage";
import { createFirstMessageTitleAdapter } from "./title";

/**
 * The single seam between the chat UI and where conversations are stored.
 *
 * `useRemoteThreadListRuntime` (in App.tsx) consumes a `RemoteThreadListAdapter`
 * and never knows or cares how it's implemented. That decoupling is the whole
 * persistence/zero-data-retention strategy:
 *
 *   ┌─────────────────────────────────────────────────────────────────────┐
 *   │  Current — CLIENT-ONLY (true zero data retention)                     │
 *   │    IndexedDB on this device is the only store. Ollama runs locally,   │
 *   │    so no chat data ever leaves the machine. This is the default and   │
 *   │    the strongest privacy posture, and what's wired up below.          │
 *   ├─────────────────────────────────────────────────────────────────────┤
 *   │  Later — BACKEND SYNC (only if cross-device is needed)                │
 *   │    Replace the body of this factory with a custom adapter whose       │
 *   │    list/initialize/rename/delete/fetch hit your API, and whose        │
 *   │    `unstable_Provider` supplies a history adapter that loads/appends  │
 *   │    messages over the network. Nothing else in the app changes.        │
 *   │    Best-in-class for retention + privacy: encrypt message payloads    │
 *   │    client-side before they're sent, so the server stores ciphertext   │
 *   │    only (E2E). Keys never leave the client.                           │
 *   └─────────────────────────────────────────────────────────────────────┘
 *
 * Today this wraps assistant-ui's battle-tested local-storage adapter, backed
 * by our IndexedDB key/value store instead of `window.localStorage`.
 */
export function createChatHistoryAdapter(): RemoteThreadListAdapter {
  return createLocalStorageAdapter({
    storage: idbStorage,
    prefix: "achad:",
    titleGenerator: createFirstMessageTitleAdapter(),
  });
}
