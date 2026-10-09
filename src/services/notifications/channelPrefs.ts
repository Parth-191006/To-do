import type { Priority } from '@/domain/types';

/**
 * Which Android channel an alert lands on.
 *
 * Do Not Disturb bypass has to be a *choice*, and Android gives us no way to
 * make it one after the fact: `bypassDnd` can only be set when a channel is
 * created and can never be changed afterwards. So the bypassing tier is a
 * separate channel id that only exists once the user opts in (Settings →
 * Notifications), and the always-present urgent channel never bypasses.
 *
 * That also keeps older installs honest. Builds up to v1.2.3 created a
 * `taskflow-urgent` channel with the flag already on, and it cannot be turned
 * off in place — so this release simply stops using that id instead of deleting
 * a channel that may still have armed alerts behind it.
 *
 * The state lives here, outside React, because scheduling happens headlessly:
 * a notification action or a boot-time re-arm must know the user's choice
 * without a component tree.
 */

/** Heads-up alerts for high and urgent tasks. Never bypasses Do Not Disturb. */
export const HIGH_CHANNEL = 'taskflow-high';

/** Opt-in variant of the above, created only while the preference is on. */
export const HIGH_DND_CHANNEL = 'taskflow-urgent-dnd';

/** Standard reminders. */
export const DEFAULT_CHANNEL = 'taskflow-default';

/** The channel id older builds used with `bypassDnd: true`. Never written to. */
export const LEGACY_URGENT_CHANNEL = 'taskflow-urgent';

let dndBypass = false;

/**
 * Records the user's choice. Returns whether it actually changed, so the caller
 * can skip re-registering channels on a redundant hydration read.
 */
export function setDndBypassPreference(next: boolean): boolean {
  const changed = dndBypass !== next;
  dndBypass = next;
  return changed;
}

export function isDndBypassEnabled(): boolean {
  return dndBypass;
}

/** The channel a task's reminders belong on, for the preference right now. */
export function channelForPriority(priority: Priority): string {
  if (priority !== 'high' && priority !== 'urgent') return DEFAULT_CHANNEL;
  return dndBypass ? HIGH_DND_CHANNEL : HIGH_CHANNEL;
}
