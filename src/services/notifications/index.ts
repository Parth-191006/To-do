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
 */
let configured = false;

export async function configureNotifications(): Promise<void> {
  configureNotificationHandler();
  if (configured) return;
  configured = true;
  await registerNotificationCategories();
  await configureNotificationChannels();
}
