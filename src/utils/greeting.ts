/**
 * The one greeting in the app, so the Today header and anything else that wants
 * to say hello to the user cannot drift apart.
 *
 * Pure and injectable (`now`) because a greeting that depends on the wall clock
 * is otherwise untestable.
 */
export function greeting(now = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}
