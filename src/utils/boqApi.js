import { dbGet, dbPatch } from './api';

const BOQ_TABLE = 'boq_items';

export async function fetchBoqItems(projectId) {
  if (!projectId) return [];
  return dbGet(BOQ_TABLE, `&project_id=eq.${projectId}&order=category.asc,sub_category.asc,item_name.asc`);
}

export async function updateBoqItem(id, patch, projectId) {
  if (!projectId) throw new Error('Project is required');
  const rows = await dbGet(BOQ_TABLE, `&id=eq.${id}&project_id=eq.${projectId}&limit=1`);
  if (!rows.length) throw new Error('BOQ item not found for current project');
  return dbPatch(BOQ_TABLE, id, patch);
}
