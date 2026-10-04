import { create } from 'zustand';

/**
 * Permission primers — the tiny state machine behind `PermissionSheet`.
 *
 * A service (notification scheduler, geofence engine) or a component (voice
 * capture) calls {@link requestPermissionWithPrimer} and awaits a boolean. The
 * gate renders the explanation, and only an explicit "Allow" resolves `true`,
 * at which point the caller is free to trigger the real OS prompt.
 *
 * Nothing here touches a native module, so the decision logic stays testable
 * and the UI stays in one place.
 */

export type PermissionKind = 'notifications' | 'location' | 'microphone' | 'photos';

interface PendingPrompt {
  kind: PermissionKind;
  resolve: (granted: boolean) => void;
}

interface PermissionPromptState {
  pending: PendingPrompt | null;
  /** Opens the explanation sheet; resolves with the user's answer. */
  request: (kind: PermissionKind) => Promise<boolean>;
}

export const usePermissionPrompt = create<PermissionPromptState>((set, get) => ({
  pending: null,
  request: (kind) => {
    // One prompt at a time: a second request inherits the answer of the first
    // only if it asks for the same thing, otherwise it is refused (the user
    // cannot answer two sheets at once anyway).
    const current = get().pending;
    if (current) return Promise.resolve(current.kind === kind);
    return new Promise<boolean>((resolve) => {
      set({ pending: { kind, resolve } });
    });
  },
}));

/** Answers the pending prompt, closing the sheet. */
export function resolvePermissionPrompt(granted: boolean): void {
  const pending = usePermissionPrompt.getState().pending;
  if (!pending) return;
  usePermissionPrompt.setState({ pending: null });
  pending.resolve(granted);
}

/** The kind being asked about right now, or null when the sheet is closed. */
export function pendingPermissionKind(pending: PendingPrompt | null): PermissionKind | null {
  return pending?.kind ?? null;
}

/**
 * Shows the explanation first. Returns false when the user declined, in which
 * case the caller must NOT trigger the OS dialog — that is the whole point.
 */
export function requestPermissionWithPrimer(kind: PermissionKind): Promise<boolean> {
  return usePermissionPrompt.getState().request(kind);
}
