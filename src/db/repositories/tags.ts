import type { Tag } from '@/domain/types';
import { createId, nowIso } from '@/utils/id';

import { getDatabase } from '../client';
import { toTag } from '../mappers';

const COLORS = [
  '#6C5CE7',
  '#0EA5E9',
  '#10B981',
  '#F59E0B',
  '#F43F5E',
  '#A78BFA',
  '#64748B',
];

export async function listTags(): Promise<Tag[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<Parameters<typeof toTag>[0]>(
    'SELECT * FROM tags ORDER BY name COLLATE NOCASE ASC',
  );
  return rows.map(toTag);
}

/** Deterministic colour so re-creating a tag keeps a stable colour. */
function colorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) % 100000;
  }
  return COLORS[hash % COLORS.length];
}

export async function findOrCreateTag(name: string, color?: string): Promise<Tag> {
  const db = await getDatabase();
  const trimmed = name.trim().replace(/^#/, '');
  if (!trimmed) throw new Error('Tag name is required');

  const existing = await db.getFirstAsync<Parameters<typeof toTag>[0]>(
    'SELECT * FROM tags WHERE name = ? COLLATE NOCASE LIMIT 1',
    [trimmed],
  );
  if (existing) return toTag(existing);

  const now = nowIso();
  const tag: Tag = {
    id: createId('tag_'),
    name: trimmed,
    color: color ?? colorForName(trimmed),
    createdAt: now,
    updatedAt: now,
    syncState: 'pending',
  };

  await db.runAsync(
    `INSERT INTO tags (id, name, color, created_at, updated_at, sync_state)
     VALUES (?, ?, ?, ?, ?, 'pending')`,
    [tag.id, tag.name, tag.color, tag.createdAt, tag.updatedAt],
  );

  return tag;
}

export async function deleteTag(tagId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM tags WHERE id = ?', [tagId]);
}

export async function setTaskTags(taskId: string, tagIds: string[]): Promise<void> {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM task_tags WHERE task_id = ?', [taskId]);
    for (const tagId of tagIds) {
      await db.runAsync(
        'INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)',
        [taskId, tagId],
      );
    }
  });
}
