import { describe, expect, it } from 'vitest';

import {
  channelForPriority,
  DEFAULT_CHANNEL,
  HIGH_CHANNEL,
  HIGH_DND_CHANNEL,
  isDndBypassEnabled,
  setDndBypassPreference,
} from '@/services/notifications/channelPrefs';

/**
 * Do Not Disturb bypass is a channel-creation flag on Android and cannot be
 * changed afterwards, so the mapping below *is* the feature: with the
 * preference off (the default), nothing the app schedules may land on a
 * bypassing channel.
 */
describe('notification channel routing', () => {
  it('starts with Do Not Disturb bypass off', () => {
    setDndBypassPreference(false);
    expect(isDndBypassEnabled()).toBe(false);
  });

  it('sends ordinary priorities to the default channel in both modes', () => {
    setDndBypassPreference(false);
    expect(channelForPriority('none')).toBe(DEFAULT_CHANNEL);
    expect(channelForPriority('low')).toBe(DEFAULT_CHANNEL);
    expect(channelForPriority('medium')).toBe(DEFAULT_CHANNEL);
    setDndBypassPreference(true);
    expect(channelForPriority('none')).toBe(DEFAULT_CHANNEL);
    expect(channelForPriority('low')).toBe(DEFAULT_CHANNEL);
    expect(channelForPriority('medium')).toBe(DEFAULT_CHANNEL);
  });

  it('never bypasses Do Not Disturb by default', () => {
    setDndBypassPreference(false);
    expect(channelForPriority('high')).toBe(HIGH_CHANNEL);
    expect(channelForPriority('urgent')).toBe(HIGH_CHANNEL);
    expect(channelForPriority('high')).not.toBe(HIGH_DND_CHANNEL);
    expect(channelForPriority('urgent')).not.toBe(HIGH_DND_CHANNEL);
  });

  it('routes high and urgent tasks to the bypassing channel only after opt-in', () => {
    expect(setDndBypassPreference(true)).toBe(true);
    expect(channelForPriority('high')).toBe(HIGH_DND_CHANNEL);
    expect(channelForPriority('urgent')).toBe(HIGH_DND_CHANNEL);
    // …and turning it back off restores the quiet channel.
    expect(setDndBypassPreference(false)).toBe(true);
    expect(channelForPriority('urgent')).toBe(HIGH_CHANNEL);
  });

  it('reports whether a preference write changed anything', () => {
    setDndBypassPreference(true);
    expect(setDndBypassPreference(true)).toBe(false);
    setDndBypassPreference(false);
    expect(setDndBypassPreference(false)).toBe(false);
  });
});
