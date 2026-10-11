/**
 * Invite-link suite.
 *
 * The token is the entire credential for joining a list, so the parsing rules
 * are security-relevant: anything that is not a well-formed hex token must be
 * rejected before it can reach the accept RPC, and the email body must never
 * claim a link exists when one could not be minted.
 */
import { describe, expect, it } from 'vitest';

import {
  buildInviteEmail,
  looksLikeInviteToken,
  parseInviteToken,
} from '@/domain/invites';

const TOKEN = 'a1b2c3d4e5f60718293a4b5c';

describe('parseInviteToken', () => {
  it('reads the standalone taskflow:// scheme', () => {
    expect(parseInviteToken(`taskflow://join/${TOKEN}`)).toBe(TOKEN);
  });

  it('reads the Expo dev-client URL', () => {
    expect(parseInviteToken(`exp://192.168.1.20:8081/--/join/${TOKEN}`)).toBe(TOKEN);
  });

  it('ignores anything after the token (query, fragment, trailing slash)', () => {
    expect(parseInviteToken(`taskflow://join/${TOKEN}?ref=email`)).toBe(TOKEN);
    expect(parseInviteToken(`taskflow://join/${TOKEN}#done`)).toBe(TOKEN);
    expect(parseInviteToken(`taskflow://join/${TOKEN}/`)).toBe(TOKEN);
  });

  it('lowercases, so a re-typed link in caps still lands', () => {
    expect(parseInviteToken(`taskflow://join/${TOKEN.toUpperCase()}`)).toBe(TOKEN);
  });

  it('rejects URLs that are not invites', () => {
    expect(parseInviteToken('taskflow://')).toBeNull();
    expect(parseInviteToken('taskflow://task/abc')).toBeNull();
    expect(parseInviteToken('https://example.com/join/')).toBeNull();
    expect(parseInviteToken(null)).toBeNull();
    expect(parseInviteToken(undefined)).toBeNull();
    expect(parseInviteToken('')).toBeNull();
  });

  it('rejects non-hex payloads sitting in the token position', () => {
    expect(parseInviteToken('taskflow://join/../../etc/passwd')).toBeNull();
    expect(parseInviteToken('taskflow://join/not-a-token!')).toBeNull();
    expect(parseInviteToken('taskflow://join/<script>')).toBeNull();
    // Too short to be one of ours (we mint 48 hex chars).
    expect(parseInviteToken('taskflow://join/abcdef')).toBeNull();
  });

  it('does not match a token embedded mid-path', () => {
    expect(parseInviteToken(`taskflow://join/${TOKEN}/settings`)).toBeNull();
  });
});

describe('looksLikeInviteToken', () => {
  it('accepts a minted token, any case, with stray whitespace', () => {
    expect(looksLikeInviteToken(TOKEN)).toBe(true);
    expect(looksLikeInviteToken(TOKEN.toUpperCase())).toBe(true);
    expect(looksLikeInviteToken(`  ${TOKEN}\n`)).toBe(true);
  });

  it('rejects anything else', () => {
    expect(looksLikeInviteToken('')).toBe(false);
    expect(looksLikeInviteToken(null)).toBe(false);
    expect(looksLikeInviteToken(undefined)).toBe(false);
    expect(looksLikeInviteToken('abc123')).toBe(false);
    expect(looksLikeInviteToken(`${TOKEN}zz`)).toBe(false);
    expect(looksLikeInviteToken('g1b2c3d4e5f60718293a4b5c')).toBe(false);
  });
});

describe('buildInviteEmail', () => {
  const APK =
    'https://github.com/Parth-191006/To-do/releases/latest/download/TaskFlow-latest.apk';

  it('leads with the invite link and carries the download link when a token exists', () => {
    const { subject, body } = buildInviteEmail({
      listName: 'Groceries',
      inviteUrl: `taskflow://join/${TOKEN}`,
      hasBackend: true,
    });

    expect(subject).toContain('Groceries');
    expect(body).toContain(`taskflow://join/${TOKEN}`);
    expect(body).toContain(APK);
    // The two steps the invitee must still take, spelled out.
    expect(body).toContain('Settings › Sync');
  });

  it('never invents a link when minting failed', () => {
    const { body } = buildInviteEmail({
      listName: 'Groceries',
      inviteUrl: null,
      hasBackend: true,
    });

    expect(body).not.toContain('taskflow://join/');
    expect(body).toContain(APK);
    // Still tells them how to end up on the same backend.
    expect(body).toContain('Settings › Sync');
  });

  it('says the backend is missing rather than promising replication that cannot happen', () => {
    const { body } = buildInviteEmail({
      listName: 'Trip',
      inviteUrl: null,
      hasBackend: false,
    });

    expect(body).toContain('no cloud backend');
    expect(body).not.toContain('our lists replicate.');
  });

  it('explains the backend is off even when a link was minted', () => {
    const { body } = buildInviteEmail({
      listName: 'Trip',
      inviteUrl: `taskflow://join/${TOKEN}`,
      hasBackend: false,
    });

    expect(body).toContain(`taskflow://join/${TOKEN}`);
    expect(body).toContain('no cloud backend configured yet');
  });

  it('quotes the list name in the subject', () => {
    const { subject } = buildInviteEmail({
      listName: 'Work “Q4”',
      inviteUrl: null,
      hasBackend: true,
    });
    expect(subject).toContain('“Work “Q4””');
  });
});
