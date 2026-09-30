import {
  configureNotificationChannels,
  configureNotificationHandler,
  registerNotificationCategories,
} from './categories';

export * from './categories';
export * from './scheduler';
export * from './actions';
export * from './geofence';

/**
 * Idempotent boot sequence. Safe to call from the root layout on every mount:
 * the handler is process-global, while channels/categories are simply
 * re-registered with identical values.
 *
 * The flag is only set *after* the async work succeeds. It used to be set first,
 * which meant a single transient failure while registering Android channels left
 * the app permanently unable to post notifications until it was reinstalled.
 */
let configured = false;

export async function configureNotifications(): Promise<boolean> {
  configureNotificationHandler();
  if (configured) return true;
  try {
    await registerNotificationCategories();
    await configureNotificationChannels();
    configured = true;
    return true;
  } catch {
    // Leave `configured` false so the next attempt (scheduling a reminder, or
    // opening Settings) retries instead of silently giving up.
    return false;
  }
}
