import { rectificationPermissions } from '@/data/access-policy'
import { commit, listRows } from '@/data/local-store'
import { listAcceptance } from '@/data/acceptance-service'
import type { ActionResult, EntryRow, RectificationRow, Viewer } from '@/data/types'

/**
 * 整改台账域：事项由验收结论自动新增，这里只负责整改回写。
 * 整改意见是验收结论快照，任何单位在整改页都改不了；责任单位只能补整改措施并推进状态。
 */

function toRectification(row: EntryRow): RectificationRow {
  return row as RectificationRow
}

export function listRectification(): RectificationRow[] {
  return listRows('rectification').map(toRectification)
}

export function getRectification(id: number): RectificationRow | undefined {
  return listRectification().find((row) => row.id === id)
}

/** 责任单位填报/更新整改措施：待整改首次保存会自动进入整改中；意见字段不在可写范围。 */
export function fillMeasures(viewer: Viewer, id: number, measures: string): ActionResult {
  const task = getRectification(id)
  if (!task) {
    return { ok: false, code: 'NOT_FOUND', message: `没有找到编号为 ${id} 的整改任务` }
  }
  const perms = rectificationPermissions(viewer, task, listAcceptance())
  if (!perms.canFill) {
    return { ok: false, code: 'FORBIDDEN', message: perms.readonlyReason || '当前状态下不可填报整改措施' }
  }
  const text = measures.trim()
  if (text === '') {
    return { ok: false, code: 'INVALID', message: '整改措施不能为空' }
  }
  saveTask(id, (row) => ({
    ...row,
    整改措施: text,
    status: row.status === '待整改' ? '整改中' : row.status,
  }))
  return { ok: true, message: '整改措施已保存' }
}

/** 责任单位提交复核：必须先填整改措施。 */
export function submitReview(viewer: Viewer, id: number): ActionResult {
  const task = getRectification(id)
  if (!task) {
    return { ok: false, code: 'NOT_FOUND', message: `没有找到编号为 ${id} 的整改任务` }
  }
  const perms = rectificationPermissions(viewer, task, listAcceptance())
  if (!perms.canSubmit) {
    return { ok: false, code: 'FORBIDDEN', message: perms.readonlyReason || '仅责任单位在整改中可提交复核' }
  }
  if (!task.整改措施.trim()) {
    return { ok: false, code: 'STATE', message: '请先填报整改措施再提交复核' }
  }
  saveTask(id, (row) => ({ ...row, status: '已整改', pending: true }))
  return { ok: true, message: '已提交验收组组长复核' }
}

/** 组长确认复核：复核权回到本组组长，跨区域和其他单位不可操作。 */
export function confirmReview(viewer: Viewer, id: number): ActionResult {
  const task = getRectification(id)
  if (!task) {
    return { ok: false, code: 'NOT_FOUND', message: `没有找到编号为 ${id} 的整改任务` }
  }
  const perms = rectificationPermissions(viewer, task, listAcceptance())
  if (!perms.canReview) {
    return { ok: false, code: 'FORBIDDEN', message: perms.readonlyReason || '仅本验收组组长可确认复核' }
  }
  saveTask(id, (row) => ({
    ...row,
    status: '已复核',
    pending: false,
    复核人: `${viewer.name}（${viewer.unit}）`,
  }))
  return { ok: true, message: '复核已确认，整改闭环' }
}

function saveTask(id: number, patch: (row: RectificationRow) => RectificationRow): void {
  const rows = listRectification()
  const next = rows.map((row) => (row.id === id ? patch(row) : row))
  commit([{ key: 'rectification', rows: next as EntryRow[] }])
}
