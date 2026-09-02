import type { Identity } from "@/lib/types";

export const IDENTITY_STORAGE_KEY = "shared-time.identity";

export function readStoredIdentity(): Identity | null {
  try {
    const raw = window.localStorage.getItem(IDENTITY_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<Identity>;
    if (typeof parsed.id !== "string" || typeof parsed.displayId !== "string") {
      return null;
    }

    return { id: parsed.id, displayId: parsed.displayId };
  } catch {
    return null;
  }
}

export function storeIdentity(identity: Identity) {
  window.localStorage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify(identity));
}

export function clearStoredIdentity() {
  window.localStorage.removeItem(IDENTITY_STORAGE_KEY);
}

