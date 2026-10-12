/**
 * The English string table — the one source of truth for user-facing copy in
 * the tab shell and Settings.
 *
 * Key style: `area.thing`, lower-camel case inside. Keys are deliberately
 * semantic (`inbox.filterAll`, not `all`), because the same English word is
 * rarely the same key twice.
 *
 * Plurals: a phrase that counts things ships as a pair — `baseOne` and
 * `baseMany` — selected by `tPlural()` (`inbox.moveTitleOne` / `…Many`).
 * English only counts on 1 today; a real locale table can redefine the rule.
 *
 * Adding a language later: create `fr.ts` with the same keys, import it in
 * `./index` and add `'fr'` to `TABLES`. `t()` falls back to English for any
 * key a translation has not caught up with, so a partial table is safe.
 */
export const en = {
  /* ---------------------------------------------------------------- tabs */
  'tabs.today': 'Today',
  'tabs.inbox': 'Inbox',
  'tabs.focus': 'Focus',
  'tabs.habits': 'Habits',
  'tabs.insights': 'Insights',

  /* ------------------------------------------------------------- shared */
  'common.working': 'Working…',
  'common.cancel': 'Cancel',
  'common.on': 'On',
  'common.off': 'Off',

  /* --------------------------------------------------------------- Today */
  'today.openSettings': 'Open settings',
  'today.opening': 'Opening…',

  /* --------------------------------------------------------------- Inbox */
  'inbox.subtitle': 'Everything you have captured.',
  'inbox.filterAll': 'All',
  'inbox.filterOpen': 'Open',
  'inbox.filterOverdue': 'Overdue',
  'inbox.filterDone': 'Done',
  'inbox.shownCount': '{count} shown',
  'inbox.selectedCount': '{count} selected',
  'inbox.cancelSelection': 'Cancel selection',
  'inbox.selectMultiple': 'Select multiple tasks',
  'inbox.select': 'Select',
  'inbox.searchPlaceholder': 'Search',
  'inbox.clearSearch': 'Clear search',
  'inbox.emptyNoMatches': 'No matches',
  'inbox.emptyNothingHere': 'Nothing here',
  'inbox.emptyNoMatchesBody': 'Nothing matches “{query}”. Try another word, or a different filter.',
  'inbox.emptyBody': 'Try another filter, or add something from Today.',
  'inbox.goToToday': 'Go to Today',
  'inbox.selectTask': 'Select {title}',
  'inbox.bulkComplete': 'Complete',
  'inbox.bulkCompleteA11y': 'Complete the selected tasks',
  'inbox.bulkMove': 'Move',
  'inbox.bulkMoveA11y': 'Move the selected tasks to a list',
  'inbox.bulkTag': 'Tag',
  'inbox.bulkTagA11y': 'Tag the selected tasks',
  'inbox.bulkDelete': 'Delete',
  'inbox.bulkDeleteA11y': 'Delete the selected tasks',
  'inbox.moveTitleOne': 'Move {count} task',
  'inbox.moveTitleMany': 'Move {count} tasks',
  'inbox.moveSubtitle': 'Pick the list they should live in.',
  'inbox.moveInbox': 'Inbox (no list)',
  'inbox.moveInboxA11y': 'Move to the inbox',
  'inbox.moveTo': 'Move to {name}',
  'inbox.tagTitleOne': 'Tag {count} task',
  'inbox.tagTitleMany': 'Tag {count} tasks',
  'inbox.tagSubtitle': 'Tap a tag, or type a new one.',
  'inbox.deleted': 'Task deleted',
  'inbox.undo': 'Undo',
  'inbox.undoA11y': 'Restore the deleted task',
  'inbox.addTagNamedA11y': 'Add the tag {name}',
  'inbox.newTagPlaceholder': 'or a new tag name',
  'inbox.newTagA11y': 'New tag name',
  'inbox.addTag': 'Add tag',
  'inbox.addTagA11y': 'Add the typed tag',

  /* ---------------------------------------------------------------- Join */
  'join.working': 'Opening your invite…',
  'join.workingBody': 'Checking this link against the list it belongs to.',
  'join.accepted': 'You joined the list',
  'join.acceptedBody': 'Its tasks are on their way to this device — taking you there now.',
  'join.signedOutTitle': 'Sign in to accept',
  'join.signedOutBody':
    'This invite is saved on this phone. Sign in under Settings › Sync with the email it was sent to, and it will be accepted automatically — you will not need the link again.',
  'join.signedOutHow':
    'Settings › Sync sends a sign-in link to your email. Open it on this device, then come back here.',
  'join.goSignIn': 'Open Sync settings',
  'join.goSignInA11y': 'Open the Settings screen to sign in',
  'join.parkedMicro':
    'THE INVITE STAYS SAVED UNTIL YOU SIGN IN OR TAP CANCEL — NOTHING ON THE LIST CHANGES UNTIL THEN.',
  'join.failedTitle': 'This invite cannot be used',
  'join.failNotFound':
    'No invite matches this link. Ask for a new one — links are single-use, so an old email may already have been opened.',
  'join.failExpired': 'This invite has expired. Ask the list owner to send a fresh one.',
  'join.failUsed':
    'This invite has already been accepted. If that was you, the list is in your app — open TaskFlow normally.',
  'join.failWrongEmail':
    'This invite was sent to a different email address. Sign in with that address under Settings › Sync, then open the link again.',
  'join.failUnknown': 'Something went wrong accepting this invite. Try again in a moment.',
  'join.failNotConfigured':
    'This build of TaskFlow has no cloud backend, so list invites do not work here. The app itself works fully offline.',
  'join.backToApp': 'Back to TaskFlow',
  'join.backToAppA11y': 'Return to the main screen',
  'join.openSettings': 'Open Settings › Sync',
  'join.openSettingsA11y': 'Open the Settings screen',

  /* --------------------------------------------------------------- Focus */
  'focus.subtitle': 'Pomodoro blocks tied to a task.',

  /* -------------------------------------------------------------- Habits */
  'habits.subtitle': 'Streaks and a five-week heatmap.',

  /* ------------------------------------------------------------ Insights */
  'insights.subtitle': 'Where your time goes.',
  'insights.rangeDays': '{days} DAYS',

  /* ------------------------------------------------------------ Settings */
  'settings.title': 'Settings',
  'settings.close': 'Close settings',
  'settings.themeSystem': 'System',
  'settings.themeLight': 'Light',
  'settings.themeMoon': 'Moon',
  'settings.sectionAppearance': 'Appearance',
  'settings.sectionNotifications': 'Notifications',
  'settings.sectionFocus': 'Focus',
  'settings.sectionSync': 'Sync',
  'settings.sectionSecurity': 'Security',
  'settings.sectionData': 'Your data',

  /* notifications */
  'settings.notifOn': 'Notifications are on',
  'settings.notifBlocked': 'Notifications are blocked',
  'settings.notifOff': 'Notifications are not set up',
  'settings.notifArmedOne': '{count} reminder armed for later',
  'settings.notifArmedMany': '{count} reminders armed for later',
  'settings.notifBlockedBody': 'Android is blocking TaskFlow — open system settings to allow them.',
  'settings.notifOffBody': 'Allow them so reminders and focus alarms can reach you.',
  'settings.rowScheduledReminders': 'Scheduled reminders',
  'settings.rowUnsyncedChanges': 'Unsynced changes',
  'settings.chipReregisterDigest': 'Re-register digest',
  'settings.chipOpenSystemSettings': 'Open system settings',
  'settings.chipEnableNotifications': 'Enable notifications',
  'settings.chipSendTest': 'Send a test',
  'settings.chipRearmAll': 'Re-arm all reminders',
  'settings.dndLabel': 'Break through Do Not Disturb',
  'settings.dndCaption':
    'Off by default. When on, high and urgent reminders use a separate channel that is allowed to make a sound and wake the screen while Do Not Disturb is on — use it for alerts you must not miss. Android only, and Android still shows the system control for it. Reminders already armed keep their old channel; press “Re-arm all reminders” to move them.',
  'settings.notifMicro':
    'TASKFLOW POSTS TIME, RECURRING AND LOCATION ALERTS. COMPLETE, SNOOZE 5M / 1H / TOMORROW AND OPEN ARE AVAILABLE STRAIGHT FROM THE BANNER. EACH URGENCY TIER IS ITS OWN CHANNEL — TUNE THEM UNDER ANDROID SETTINGS › APPS › TASKFLOW › NOTIFICATIONS. IF A REMINDER ARRIVES A FEW MINUTES LATE, ALLOW “ALARMS & REMINDERS” FOR TASKFLOW THERE TOO.',

  /* focus */
  'settings.autoStartBreakLabel': 'Auto-start breaks',
  'settings.autoStartBreakCaption':
    'When a focus block reaches zero, the break countdown starts right away instead of waiting for you to press start.',
  'settings.rowDailyFocusGoal': 'Daily focus goal',
  'settings.minutesValue': '{count} min',
  'settings.rowWeeklyTaskGoal': 'Weekly task goal',
  'settings.notSet': 'not set',
  'settings.countTasksOne': '{count} task',
  'settings.countTasksMany': '{count} tasks',
  'settings.focusHint':
    'Change the daily goal, the long-break cycle and a custom focus or break length from the Focus tab: tap “Custom”.',
  'settings.focusMicro':
    'THE BREAK KEEPS TIME AGAINST THE WALL CLOCK — LOCK THE SCREEN OR LEAVE THE APP AND IT STILL COUNTS DOWN AND FIRES THE END ALERT.',

  /* sync */
  'settings.rowBackend': 'Backend',
  'settings.backendConnected': 'Supabase connected',
  'settings.backendLocal': 'Local only',
  'settings.rowPendingChanges': 'Pending changes',
  'settings.chipSyncNow': 'Sync now',
  'settings.rowSignedInAs': 'Signed in as',
  'settings.chipSignOut': 'Sign out',
  'settings.emailA11y': 'Email address',
  'settings.emailPlaceholder': 'you@example.com',
  'settings.chipLinkSent': 'Link sent — check your inbox',
  'settings.chipSendSignInLink': 'Send sign-in link',
  'settings.syncMicro':
    'SET EXPO_PUBLIC_SUPABASE_URL AND EXPO_PUBLIC_SUPABASE_ANON_KEY TO ENABLE CLOUD SYNC AND SHARED LISTS. THE APP IS FULLY FUNCTIONAL OFFLINE WITHOUT THEM.',

  /* security */
  'settings.appLockLabel': 'App lock',
  'settings.appLockCaption':
    'Ask for your fingerprint, face or device PIN when TaskFlow opens (and again after 30 seconds away). Uses the screen lock already on this phone — no TaskFlow password to remember.',

  /* your data */
  'settings.rowProjects': 'Projects',
  'settings.rowTasks': 'Tasks',
  'settings.rowHabits': 'Habits',
  'settings.rowLocalBackup': 'Local backup',
  'settings.backupNoneYet': 'none yet',
  'settings.weeklyBackupLabel': 'Weekly automatic backup',
  'settings.weeklyBackupCaption':
    'Off by default. When TaskFlow opens and a week has passed, it writes a dated JSON copy into the app’s own backup folder and keeps the last four — so a bad week never overwrites a good copy. A copy written silently into your phone’s shared storage is not possible without a heavier dependency, so use Export JSON when you want the file somewhere else.',
  'settings.rowLastBackup': 'Last automatic backup',
  'settings.backupNever': 'never',
  'settings.chipExportJson': 'Export JSON',
  'settings.chipExportJsonA11y': 'Export every task, habit and list as JSON',
  'settings.chipExportCsv': 'Export CSV',
  'settings.chipExportCsvA11y': 'Export tasks as CSV',
  'settings.chipImport': 'Import',
  'settings.chipImportA11y': 'Import from a TaskFlow backup',
  'settings.chipBackupNow': 'Back up now',
  'settings.chipBackupNowA11y': 'Write a local backup now',
  'settings.chipRestoreBackup': 'Restore backup',
  'settings.chipRestoreBackupA11y': 'Restore the last local backup',
  'settings.privacy':
    'Privacy: everything you type lives in a SQLite database inside this app — tasks, notes, habits, focus sessions, notification bookkeeping and your attached photos and voice notes. Nothing is uploaded while you stay local; the only network calls this build can make are the optional Supabase sync (only with your own credentials and after you sign in) and an AI transcription or breakdown endpoint if you configured one. Backups written here are files on this device, shared only when you choose a destination.',
  'settings.dataMicro':
    'EXPORTS CARRY EVERY TASK, LIST, TAG AND HABIT (JSON) OR ONE ROW PER TASK (CSV). CLEARING LOCAL DATA WRITES A BACKUP FIRST, SO IT CAN BE UNDONE.',
  'settings.chipReset': 'Reset local data',
  'settings.chipResetA11y': 'Clear all local data',

  /* diagnostics */
  'settings.sectionDiagnostics': 'Diagnostics',
  'settings.crashLogLabel': 'Keep a local crash log',
  'settings.crashLogCaption':
    'Off by default. When on, uncaught errors are recorded on this device — message, stack trace, app version and platform, with email addresses and long token-like strings removed. Nothing is ever uploaded: there is no server to send it to. Use the chips below to read, share or clear what has been logged. Turning this off stops new entries; it does not delete existing ones.',
  'settings.rowCrashEntries': 'Crash entries stored',
  'settings.chipViewCrashLog': 'View log',
  'settings.chipViewCrashLogA11y': 'Show the crash reports recorded on this device',
  'settings.chipShareCrashLog': 'Share log',
  'settings.chipShareCrashLogA11y': 'Share the crash reports through another app',
  'settings.chipClearCrashLog': 'Clear log',
  'settings.chipClearCrashLogA11y': 'Delete the crash reports stored on this device',
  'settings.crashLogEmpty': 'Nothing has been logged yet.',
  'settings.crashLogCleared': 'Crash log cleared.',
  'settings.crashLogShared': 'Pick where to send the crash log.',
  'settings.crashLogShareFailed': 'Could not open a share destination on this device.',
  'settings.crashLogMicro':
    'THE LOG LIVES IN THIS APP\'S PRIVATE STORAGE AND LEAVES ONLY WHEN YOU TAP “SHARE LOG”. IT CONTAINS NO TASK TEXT, NO NOTES AND NO ACCOUNT DETAILS.',

  /* experimental */
  'settings.sectionExperimental': 'Experimental',
  'settings.experimentalLabel': 'Preview unfinished features',
  'settings.experimentalCaption':
    'Off by default. Everything behind this switch works, but it is not whole yet — turning it on is opting into a preview, not into a finished feature. Nothing already saved is deleted when it is off; those features simply stop being shown and stop being armed.',
  'settings.experimentalPlacesTitle': 'Place reminders',
  'settings.experimentalPlacesWhy':
    'A place reminder can only be dropped where you are standing, with a fixed 150 m radius, and it always fires on arrival — “when I leave” and searching for an address are not built. Its notification also arrives on the default channel with no Complete or Snooze button, unlike every timed reminder.',
  'settings.experimentalMicro':
    'PLACE REMINDERS ARE THE ONLY PREVIEW TODAY. WHEN THIS IS OFF, ANY LOCATION REMINDER YOU ALREADY SAVED IS KEPT IN THE DATABASE AND SIMPLY NOT ARMED — TURNING IT BACK ON RE-ARMS IT.',

  /* about */
  'settings.tagline': 'Capture, focus, finish.',
  'settings.aboutBody':
    'Every feature ships unlocked: unlimited projects and subtasks, AI breakdown, location reminders, actionable snooze, focus timer, habit analytics and themes. No paywall, no tiers.',
  'settings.chipShowTour': 'Show the tour again',
  'settings.chipShowTourA11y': 'Replay the first-run overview',
  'settings.versionMicro': 'VERSION {version} · BUILT WITH EXPO + SQLITE + SUPABASE',

  /* import sheet */
  'settings.importTitle': 'Import TaskFlow data',
  'settings.importSubtitle':
    'Paste a backup file, check what it would add, then apply it. Items already on this device are kept as they are.',
  'settings.importPasteA11y': 'Paste backup JSON',
  'settings.chipCheckFile': 'Check the file',
  'settings.chipCheckFileA11y': 'Check the pasted file',
  'settings.chipImporting': 'Importing…',
  'settings.importAddOne': 'Add {count} item',
  'settings.importAddMany': 'Add {count} items',
  'settings.importAddA11y': 'Import the pasted data',
  'settings.cancelImportA11y': 'Cancel the import',

  /* status messages surfaced by the handlers above */
  'settings.msgValidEmail': 'Enter a valid email address.',
  'settings.msgSignInFailed': 'Could not send the sign-in link — {error}',
  'settings.msgSignInSent': 'Sign-in link sent — open it on this device to sign in.',
  'settings.msgSignedOut': 'Signed out on this device.',
  'settings.msgOpenSystemSettings':
    'Turn on notifications for TaskFlow, then come back and re-arm your reminders.',
  'settings.msgNotificationsEnabled':
    'Notifications enabled — your daily 8:30am digest is armed.',
  'settings.msgPermissionNotGranted':
    'Notification permission was not granted — allow it in system settings.',
  'settings.msgNotificationsFailed': 'Could not set up notifications on this device.',
  'settings.msgTestSending':
    'Sending… you should see the banner in about 4 seconds. Lock the screen to be sure.',
  'settings.msgTestFailedDevice': 'Could not send a test notification on this device.',
  'settings.msgTestFailed': 'Could not send a test notification.',
  'settings.msgRearmedOne': 'Re-armed {count} reminder.',
  'settings.msgRearmedMany': 'Re-armed {count} reminders.',
  'settings.msgNothingToSync': 'Nothing to sync — {reason}',
  'settings.msgSynced': 'Pushed {pushed}, pulled {pulled}',
  'settings.msgSyncedErrors': 'Pushed {pushed}, pulled {pulled}, {errors} error(s)',
  'settings.msgCleared': 'Local data cleared — a backup was saved first.',
  'settings.msgNoLocalBackup': 'No local backup on this device yet — export one first.',
  'settings.msgCouldNotReadBackup': 'Could not read the local backup.',
  'settings.msgExportedShared': 'Exported ({format}) — pick where to send it.',
  'settings.msgExportedTo': 'Exported to {uri}',
  'settings.msgExportFailed': 'Could not export.',
  'settings.msgBackupWritten': 'Local backup written on this device.',
  'settings.msgBackupFailed': 'Could not write the backup.',
} as const;

export type StringKey = keyof typeof en;
