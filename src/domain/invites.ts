/**
 * Invite-link logic that must run identically in the app and in Node tests.
 *
 * The deep link is the whole credential: whoever holds the token can join the
 * list, so the parsing here has to be strict (nothing but a well-formed token
 * ever reaches the accept RPC) and the email body has to carry both the link
 * and the fallback for a phone that does not have TaskFlow installed yet.
 */

/** Path segment every invite link ends with: `taskflow://join/<token>`. */
export const INVITE_PATH = 'join';

/**
 * Matches `/join/<token>` anywhere a URL may put its path — the standalone
 * `taskflow://` scheme, the Expo dev client (`exp://host:8081/--/join/…`) and
 * an https fallback. Tokens are hex (24 random bytes), so anything that is not
 * hex is not our token and is rejected rather than forwarded to the RPC.
 *
 * The token has to be the final path segment: an optional query, fragment or
 * single trailing slash is tolerated (mail apps and messengers add them), but
 * `/join/<token>/settings` is not a link we minted and does not match.
 */
const INVITE_TOKEN_PATTERN = /\/join\/([0-9a-f]{16,128})(?:\?[^#\s]*)?(?:#[^\s]*)?\/?$/i;

/**
 * Extracts the invite token from a opened URL, or null when the URL is not an
 * invite at all. Lowercased so a user who re-typed the link in caps still
 * lands, since the tokens we mint are lowercase hex.
 */
export function parseInviteToken(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = INVITE_TOKEN_PATTERN.exec(url.trim());
  return match ? match[1].toLowerCase() : null;
}

/** True when the string could be a token we minted (hex, right length). */
export function looksLikeInviteToken(value: string | null | undefined): boolean {
  return typeof value === 'string' && /^[0-9a-f]{16,128}$/.test(value.trim().toLowerCase());
}

export interface InviteEmailInput {
  listName: string;
  /** The `taskflow://join/<token>` link, or null when no token could be minted. */
  inviteUrl: string | null;
  /** Whether this build can actually replicate a shared list. */
  hasBackend: boolean;
}

export interface InviteEmail {
  subject: string;
  body: string;
}

/**
 * The invite email. Two honest states:
 *
 *  - a link exists → the body leads with it and explains the two steps the
 *    invitee still has to take (install, sign in with the invited address);
 *  - no link (no backend, not signed in, RPC failed) → the body says so and
 *    falls back to the download link alone, instead of shipping a body that
 *    pretends an invite was created.
 */
export function buildInviteEmail(input: InviteEmailInput): InviteEmail {
  const subject = `Invitation to collaborate on “${input.listName}” in TaskFlow`;
  const apkUrl =
    'https://github.com/Parth-191006/To-do/releases/latest/download/TaskFlow-latest.apk';

  const lines: string[] = ['Hi,', '', `I’d like to share the “${input.listName}” list from TaskFlow with you.`];

  if (input.inviteUrl) {
    lines.push(
      '',
      '1. Install TaskFlow (Android):',
      apkUrl,
      '',
      '2. Open this invite link on that phone (with TaskFlow installed):',
      input.inviteUrl,
      '',
      input.hasBackend
        ? 'Sign in under Settings › Sync with the email this invite was sent to, then open the link again — the list appears for both of us.'
        : 'This build has no cloud backend configured yet, so the list will replicate once we connect one under Settings › Sync.',
    );
  } else {
    lines.push(
      '',
      'Get TaskFlow (Android):',
      apkUrl,
      '',
      input.hasBackend
        ? 'Once it is installed, open Settings › Sync and sign in with this email so our lists replicate.'
        : 'This build of TaskFlow has no cloud backend configured, so lists do not sync yet — once it is installed we can connect one under Settings › Sync.',
    );
  }

  lines.push('', '— sent from TaskFlow');
  return { subject, body: lines.join('\n') };
}
