import type { Project, SharedListMember } from '@/domain/types';
import { createId, nowIso } from '@/utils/id';

import { getDatabase } from '../client';
import { toProject } from '../mappers';

export interface ProjectWithStats extends Project {
  openTasks: number;
  totalTasks: number;
  /** 0..1 completion ratio. */
  progress: number;
}

export async function listProjects(includeArchived = false): Promise<ProjectWithStats[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<Parameters<typeof toProject>[0] & { open_tasks: number; total_tasks: number }>(
    `SELECT p.*,
            SUM(CASE WHEN t.status NOT IN ('done','archived') THEN 1 ELSE 0 END) AS open_tasks,
            COUNT(t.id) AS total_tasks
     FROM projects p
     LEFT JOIN tasks t ON t.project_id = p.id AND t.deleted_at IS NULL
     WHERE p.deleted_at IS NULL ${includeArchived ? '' : 'AND p.is_archived = 0'}
     GROUP BY p.id
     ORDER BY p.position ASC, p.created_at ASC`,
  );

  return rows.map((row) => {
    const total = row.total_tasks ?? 0;
    const open = row.open_tasks ?? 0;
    return {
      ...toProject(row),
      openTasks: open,
      totalTasks: total,
      progress: total === 0 ? 0 : (total - open) / total,
    };
  });
}

export async function createProject(input: {
  name: string;
  color?: string;
  icon?: string;
}): Promise<Project> {
  const db = await getDatabase();
  const now = nowIso();
  const project: Project = {
    id: createId('prj_'),
    name: input.name.trim() || 'New project',
    color: input.color ?? '#0D9488',
    icon: input.icon ?? 'folder',
    isArchived: false,
    position: Date.now(),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    syncState: 'pending',
  };

  await db.runAsync(
    `INSERT INTO projects (id, name, color, icon, is_archived, position, created_at, updated_at, sync_state)
     VALUES (?, ?, ?, ?, 0, ?, ?, ?, 'pending')`,
    [project.id, project.name, project.color, project.icon, project.position, project.createdAt, project.updatedAt],
  );

  return project;
}

export async function updateProject(
  id: string,
  patch: Partial<Pick<Project, 'name' | 'color' | 'icon' | 'isArchived' | 'position'>>,
): Promise<void> {
  const db = await getDatabase();
  const existing = await db.getFirstAsync<Parameters<typeof toProject>[0]>(
    'SELECT * FROM projects WHERE id = ?',
    [id],
  );
  if (!existing) return;
  const merged = { ...toProject(existing), ...patch };

  await db.runAsync(
    `UPDATE projects SET name = ?, color = ?, icon = ?, is_archived = ?, position = ?,
       updated_at = ?, sync_state = 'pending' WHERE id = ?`,
    [
      merged.name,
      merged.color,
      merged.icon,
      merged.isArchived ? 1 : 0,
      merged.position,
      nowIso(),
      id,
    ],
  );
}

export async function archiveProject(id: string, archived = true): Promise<void> {
  await updateProject(id, { isArchived: archived });
}

export async function deleteProject(id: string): Promise<void> {
  const db = await getDatabase();
  const now = nowIso();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE tasks SET deleted_at = ?, updated_at = ?, sync_state = 'pending'
       WHERE project_id = ? AND deleted_at IS NULL`,
      [now, now, id],
    );
    await db.runAsync(
      `UPDATE projects SET deleted_at = ?, updated_at = ?, sync_state = 'pending' WHERE id = ?`,
      [now, now, id],
    );
  });
}

export async function listMembers(projectId: string): Promise<SharedListMember[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    id: string;
    project_id: string;
    user_id: string;
    display_name: string;
    role: string;
    joined_at: string;
  }>('SELECT * FROM list_members WHERE project_id = ? ORDER BY joined_at ASC', [projectId]);

  return rows.map((row) => ({
    id: row.id,
    projectId: row.project_id,
    userId: row.user_id,
    displayName: row.display_name,
    role: row.role === 'owner' || row.role === 'editor' ? row.role : 'viewer',
    joinedAt: row.joined_at,
  }));
}

export async function addMember(input: {
  projectId: string;
  userId: string;
  displayName: string;
  role: SharedListMember['role'];
}): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO list_members (id, project_id, user_id, display_name, role, joined_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [createId('mem_'), input.projectId, input.userId, input.displayName, input.role, nowIso()],
  );
}
