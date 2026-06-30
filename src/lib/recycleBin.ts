// Recycle Bin helpers — archive deletions instead of permanent loss,
// then restore from the snapshot when needed. Super admin only UI.
import { supabase } from '@/integrations/supabase/client';
import type { AppUser } from '@/contexts/AuthContext';

export type DeletableTable =
  | 'receives'
  | 'receive_cartons'
  | 'receive_issues'
  | 'receive_issue_lines'
  | 'cartons'
  | 'carton_history'
  | 'notifications'
  | 'app_users'
  | 'offices';

type AnyRow = Record<string, unknown>;
type Children = Record<string, AnyRow[]>;
type Payload = { main: AnyRow; children?: Children };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = supabase;

const fetchRowsByIds = async (table: string, ids: string[]): Promise<AnyRow[]> => {
  if (ids.length === 0) return [];
  const { data, error } = await sb.from(table).select('*').in('id', ids);
  if (error) throw error;
  return (data || []) as AnyRow[];
};

const fetchRowsByCol = async (table: string, col: string, vals: string[]): Promise<AnyRow[]> => {
  if (vals.length === 0) return [];
  const { data, error } = await sb.from(table).select('*').in(col, vals);
  if (error) throw error;
  return (data || []) as AnyRow[];
};

// Build a payload for a single record including children we want preserved.
const buildPayload = async (table: DeletableTable, row: AnyRow): Promise<Payload> => {
  const children: Children = {};
  const id = String(row.id);
  if (table === 'receives') {
    children.receive_cartons = await fetchRowsByCol('receive_cartons', 'receive_id', [id]);
    const issues = await fetchRowsByCol('receive_issues', 'receive_id', [id]);
    children.receive_issues = issues;
    const issueIds = issues.map((i) => String(i.id));
    children.receive_issue_lines = await fetchRowsByCol('receive_issue_lines', 'issue_id', issueIds);
  } else if (table === 'receive_issues') {
    children.receive_issue_lines = await fetchRowsByCol('receive_issue_lines', 'issue_id', [id]);
  } else if (table === 'offices') {
    const receives = await fetchRowsByCol('receives', 'office_id', [id]);
    children.receives = receives;
    const rids = receives.map((r) => String(r.id));
    children.receive_cartons = await fetchRowsByCol('receive_cartons', 'receive_id', rids);
    const issues = await fetchRowsByCol('receive_issues', 'receive_id', rids);
    children.receive_issues = issues;
    children.receive_issue_lines = await fetchRowsByCol(
      'receive_issue_lines',
      'issue_id',
      issues.map((i) => String(i.id)),
    );
    children.cartons = await fetchRowsByCol('cartons', 'office_id', [id]);
    children.app_users = await fetchRowsByCol('app_users', 'office_id', [id]);
  }
  return { main: row, children };
};

const defaultLabel = (table: DeletableTable, row: AnyRow): string => {
  const r = row as Record<string, unknown>;
  switch (table) {
    case 'receives':
      return `Receive ${r.challan_no || r.si_no || ''} — buyer ${r.buyer || ''} · PO ${r.po_no || '—'} · style ${r.style || ''}`.trim();
    case 'receive_issues':
      return `Issue ${r.issue_no || ''} (${r.purpose || ''}) · PO ${r.po_no || '—'}`;
    case 'receive_issue_lines':
      return `Issue line — ${r.size || ''} × ${r.ctn_qty || 0}`;
    case 'receive_cartons':
      return `Receive carton ${r.carton_no || ''}`;
    case 'cartons':
      return `Carton ${r.carton_no || ''} — ${r.buyer || ''} · PO ${r.po_no || '—'} · style ${r.style_no || ''}`;
    case 'carton_history':
      return `${r.action || 'history'} by ${r.changed_by_name || ''}`;
    case 'notifications':
      return `Notification — ${r.title || r.message || ''}`;
    case 'app_users':
      return `User ${r.name || ''} (${r.access_id || ''})`;
    case 'offices':
      return `Office ${r.name || ''}`;
    default:
      return String(table);
  }
};

export interface SoftDeleteOpts {
  user?: AppUser | null;
  label?: (row: AnyRow) => string;
}

/**
 * Archive rows into deleted_items, then delete them from the source table.
 * Returns the number of rows archived.
 */
export const softDelete = async (
  table: DeletableTable,
  ids: string[],
  opts: SoftDeleteOpts = {},
): Promise<number> => {
  if (ids.length === 0) return 0;
  const rows = await fetchRowsByIds(table, ids);
  if (rows.length === 0) return 0;

  const archive = await Promise.all(
    rows.map(async (row) => ({
      table_name: table,
      record_id: String(row.id),
      label: (opts.label ? opts.label(row) : defaultLabel(table, row)).slice(0, 240),
      payload: (await buildPayload(table, row)) as unknown as AnyRow,
      deleted_by: opts.user?.id ?? null,
      deleted_by_name: opts.user?.name ?? null,
    })),
  );

  const { error: insErr } = await sb.from('deleted_items').insert(archive);
  if (insErr) throw insErr;

  const { error: delErr } = await sb.from(table).delete().in('id', ids);
  if (delErr) throw delErr;
  return rows.length;
};

/** Restore one deleted_items row back into its source table (and children). */
export const restoreDeletedItem = async (deletedItemId: string): Promise<void> => {
  const { data, error } = await sb.from('deleted_items').select('*').eq('id', deletedItemId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Deleted item not found');
  const table = data.table_name as DeletableTable;
  const payload = data.payload as Payload;
  const main = payload.main;
  const children = payload.children || {};

  // Insert in dependency-safe order
  if (table === 'offices') {
    await sb.from('offices').upsert(main, { onConflict: 'id' });
    if (children.app_users?.length) await sb.from('app_users').upsert(children.app_users, { onConflict: 'id' });
    if (children.receives?.length) await sb.from('receives').upsert(children.receives, { onConflict: 'id' });
    if (children.receive_cartons?.length)
      await sb.from('receive_cartons').upsert(children.receive_cartons, { onConflict: 'id' });
    if (children.receive_issues?.length)
      await sb.from('receive_issues').upsert(children.receive_issues, { onConflict: 'id' });
    if (children.receive_issue_lines?.length)
      await sb.from('receive_issue_lines').upsert(children.receive_issue_lines, { onConflict: 'id' });
    if (children.cartons?.length) await sb.from('cartons').upsert(children.cartons, { onConflict: 'id' });
  } else if (table === 'receives') {
    await sb.from('receives').upsert(main, { onConflict: 'id' });
    if (children.receive_cartons?.length)
      await sb.from('receive_cartons').upsert(children.receive_cartons, { onConflict: 'id' });
    if (children.receive_issues?.length)
      await sb.from('receive_issues').upsert(children.receive_issues, { onConflict: 'id' });
    if (children.receive_issue_lines?.length)
      await sb.from('receive_issue_lines').upsert(children.receive_issue_lines, { onConflict: 'id' });
  } else if (table === 'receive_issues') {
    await sb.from('receive_issues').upsert(main, { onConflict: 'id' });
    if (children.receive_issue_lines?.length)
      await sb.from('receive_issue_lines').upsert(children.receive_issue_lines, { onConflict: 'id' });
  } else {
    await sb.from(table).upsert(main, { onConflict: 'id' });
  }

  const { error: delErr } = await sb.from('deleted_items').delete().eq('id', deletedItemId);
  if (delErr) throw delErr;
};

export const restoreMany = async (ids: string[]): Promise<number> => {
  let n = 0;
  for (const id of ids) {
    try {
      await restoreDeletedItem(id);
      n += 1;
    } catch {
      /* skip failures, continue with the rest */
    }
  }
  return n;
};

export const emptyRecycleBin = async (): Promise<void> => {
  const { error } = await sb.from('deleted_items').delete().not('id', 'is', null);
  if (error) throw error;
};

export const deleteFromBin = async (ids: string[]): Promise<void> => {
  if (ids.length === 0) return;
  const { error } = await sb.from('deleted_items').delete().in('id', ids);
  if (error) throw error;
};
