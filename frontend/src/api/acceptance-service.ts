import { allRows, listRows, saveAll } from '@/data/local-store'
import {
  canConfirmConclusion,
  canHandleRectification,
  canSubmitCountersign,
} from '@/data/permissions'
import type { ActionResult, CountersignRecord, EntryRow, Identity } from '@/data/types'

// 验收 → 整改回写链路：启动验收、会签、组长定结论、整改台账新增事项全部收口在这里，
// 页面只调这里，权限口径统一走 data/permissions.ts，别处不再各自判断。

const ACCEPTANCE = 'acceptance'
const RECTIFICATION = 'rectification'

// 组长确认结论的动作 → 报告状态 / 验收结论
const CONCLUSION_FLOW: Record<string, { status: string; verdict: string }> = {
  确认通过: { status: '验收通过', verdict: '通过' },
  要求整改: { status: '需整改', verdict: '需整改' },
  驳回结论: { status: '已驳回', verdict: '驳回' },
}

// 整改任务的动作 → 任务状态
const RECTIFICATION_FLOW: Record<string, string> = {
  开始整改: '整改中',
  提交复核: '已整改',
  确认复核: '已复核',
}

function now(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function todayPlus(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function findRow(rows: EntryRow[], id: number): EntryRow | undefined {
  return rows.find((row) => Number(row.id) === id)
}

function replaceRow(rows: EntryRow[], updated: EntryRow): EntryRow[] {
  return rows.map((row) => (Number(row.id) === Number(updated.id) ? updated : row))
}

function notFound(entity: string, id: number): ActionResult {
  return { ok: false, message: `没有找到编号为 ${id} 的${entity}` }
}

/** 报告详情：报告本体 + 会签记录 + 关联的整改任务（按验收编号挂接）。 */
export function getAcceptanceDetail(id: number): {
  report: EntryRow
  countersigns: CountersignRecord[]
  rectifications: EntryRow[]
} | null {
  const report = findRow(listRows(ACCEPTANCE), id)
  if (!report) {
    return null
  }
  const code = String(report['验收编号'] ?? '')
  const rectifications = listRows(RECTIFICATION).filter(
    (row) => String(row['验收编号'] ?? '') === code,
  )
  const countersigns = Array.isArray(report['会签记录'])
    ? (report['会签记录'] as CountersignRecord[])
    : []
  return { report, countersigns, rectifications }
}

/** 启动验收：本组成员把报告从「待验收」推进到「验收中」。 */
export function startAcceptance(id: number, identity: Identity): ActionResult {
  const rows = listRows(ACCEPTANCE)
  const report = findRow(rows, id)
  if (!report) {
    return notFound('验收报告', id)
  }
  const check = canSubmitCountersign(identity, report)
  if (!check.ok) {
    return { ok: false, message: check.reason }
  }
  if (report.status !== '待验收') {
    return { ok: false, message: `报告当前状态「${report.status}」，不能启动验收` }
  }
  const updated: EntryRow = { ...report, status: '验收中', pending: true, 验收状态: '验收中' }
  try {
    saveAll({ ...allRows(), [ACCEPTANCE]: replaceRow(rows, updated) })
  } catch {
    return { ok: false, message: '验收报告写入失败，已整体回退，请重试' }
  }
  return { ok: true, message: '验收已启动，验收组成员可提交会签' }
}

/** 会签提交：本组成员一人一签，重复提交只更新本人意见，不多开记录。 */
export function submitCountersign(id: number, identity: Identity, opinion: string): ActionResult {
  const text = opinion.trim()
  if (!text) {
    return { ok: false, message: '会签意见不能为空' }
  }
  const rows = listRows(ACCEPTANCE)
  const report = findRow(rows, id)
  if (!report) {
    return notFound('验收报告', id)
  }
  const check = canSubmitCountersign(identity, report)
  if (!check.ok) {
    return { ok: false, message: check.reason }
  }
  if (String(report['结论确认人'] ?? '') !== '') {
    return { ok: false, message: '结论已确认，会签已截止' }
  }
  if (report.status === '待验收') {
    return { ok: false, message: '请先启动验收，再提交会签' }
  }
  const existing = Array.isArray(report['会签记录'])
    ? (report['会签记录'] as CountersignRecord[])
    : []
  const others = existing.filter((item) => item.member !== identity.name)
  const record: CountersignRecord = { member: identity.name, unit: identity.unit, opinion: text, time: now() }
  const updated: EntryRow = { ...report, 会签记录: [...others, record] }
  try {
    saveAll({ ...allRows(), [ACCEPTANCE]: replaceRow(rows, updated) })
  } catch {
    return { ok: false, message: '会签写入失败，已整体回退，请重试' }
  }
  return { ok: true, message: `已登记 ${identity.name} 的会签意见` }
}

/** 整改意见维护：结论确认前由本组成员修订，确认后只读。 */
export function updateRectificationOpinion(id: number, identity: Identity, opinion: string): ActionResult {
  const rows = listRows(ACCEPTANCE)
  const report = findRow(rows, id)
  if (!report) {
    return notFound('验收报告', id)
  }
  const check = canSubmitCountersign(identity, report)
  if (!check.ok) {
    return { ok: false, message: check.reason }
  }
  if (String(report['结论确认人'] ?? '') !== '') {
    return { ok: false, message: '结论已确认，整改意见不可再修改' }
  }
  const updated: EntryRow = { ...report, 整改意见: opinion.trim() }
  try {
    saveAll({ ...allRows(), [ACCEPTANCE]: replaceRow(rows, updated) })
  } catch {
    return { ok: false, message: '整改意见写入失败，已整体回退，请重试' }
  }
  return { ok: true, message: '整改意见已更新' }
}

/**
 * 组长定结论：确认通过 / 要求整改 / 驳回结论。
 * - 单版本：以写入前读到的最新状态为准，已有确认结论的报告拒绝再次确认，
 *   并存的通过/驳回只接受先到的版本；
 * - 整改回写：结论为「需整改」时整改台账必须新增事项，按验收编号幂等，重复确认不多开；
 * - 事务：报告与整改台账一次落库，任一写入失败全部回退。
 */
export function confirmConclusion(
  id: number,
  identity: Identity,
  action: string,
  opinion = '',
): ActionResult {
  const flow = CONCLUSION_FLOW[action]
  if (!flow) {
    return { ok: false, message: `验收报告没有登记「${action}」这个结论动作` }
  }
  const acceptanceRows = listRows(ACCEPTANCE)
  const report = findRow(acceptanceRows, id)
  if (!report) {
    return notFound('验收报告', id)
  }
  const check = canConfirmConclusion(identity, report)
  if (!check.ok) {
    return { ok: false, message: check.reason }
  }
  const confirmedBy = String(report['结论确认人'] ?? '')
  if (confirmedBy !== '') {
    return {
      ok: false,
      message: `结论已由 ${confirmedBy} 于 ${report['结论确认时间']} 确认为「${report['验收结论']}」，通过/驳回只接受一个版本`,
    }
  }
  const text = opinion.trim()
  if (flow.status === '需整改' && text === '' && String(report['整改意见'] ?? '').trim() === '') {
    return { ok: false, message: '要求整改时必须填写整改意见' }
  }

  const confirmed: EntryRow = {
    ...report,
    status: flow.status,
    pending: flow.status === '需整改',
    abnormal: flow.status === '已驳回',
    验收状态: flow.status,
    验收结论: flow.verdict,
    整改意见: text !== '' ? text : String(report['整改意见'] ?? ''),
    结论确认人: identity.name,
    结论确认时间: now(),
  }
  const nextAcceptance = replaceRow(acceptanceRows, confirmed)

  // 整改回写：结论确认后旁路业务面的整改台账必须新增事项；按验收编号判重，重复确认不多开
  let nextRectification = listRows(RECTIFICATION)
  let createdTask: EntryRow | null = null
  if (flow.status === '需整改') {
    const code = String(report['验收编号'] ?? '')
    const exists = nextRectification.some((row) => String(row['验收编号'] ?? '') === code)
    if (!exists) {
      const nextId = nextRectification.reduce((max, row) => Math.max(max, Number(row.id)), 0) + 1
      createdTask = {
        id: nextId,
        status: '待整改',
        pending: true,
        abnormal: false,
        任务编号: `RECT-${String(nextId).padStart(4, '0')}`,
        验收编号: code,
        整改内容: confirmed['整改意见'] as string,
        责任单位: String(report['归属单位'] ?? ''),
        所属区域: String(report['所属区域'] ?? ''),
        整改期限: todayPlus(30),
        整改措施: '',
        复核人: '',
        整改状态: '待整改',
      }
      nextRectification = [...nextRectification, createdTask]
    }
  }

  try {
    saveAll({ ...allRows(), [ACCEPTANCE]: nextAcceptance, [RECTIFICATION]: nextRectification })
  } catch {
    return { ok: false, message: '验收结论与整改台账写入失败，已整体回退，请重试' }
  }
  const extra =
    flow.status !== '需整改'
      ? ''
      : createdTask
        ? `，整改台账已新增「${createdTask['任务编号']}」`
        : '，整改台账已存在关联事项，未重复开具'
  return { ok: true, message: `结论已确认为「${flow.verdict}」${extra}` }
}

/** 整改任务流转：仅责任单位可处理，跨区域只读。 */
export function runRectificationAction(id: number, identity: Identity, action: string): ActionResult {
  const target = RECTIFICATION_FLOW[action]
  if (!target) {
    return { ok: false, message: `整改任务没有登记「${action}」这个动作` }
  }
  const rows = listRows(RECTIFICATION)
  const task = findRow(rows, id)
  if (!task) {
    return notFound('整改任务', id)
  }
  const check = canHandleRectification(identity, task)
  if (!check.ok) {
    return { ok: false, message: check.reason }
  }
  if (task.status === target) {
    return { ok: false, message: `整改任务已经是「${target}」，不用重复操作` }
  }
  const updated: EntryRow = {
    ...task,
    status: target,
    pending: target !== '已复核',
    整改状态: target,
    复核人: action === '确认复核' ? identity.name : String(task['复核人'] ?? ''),
  }
  try {
    saveAll({ ...allRows(), [RECTIFICATION]: replaceRow(rows, updated) })
  } catch {
    return { ok: false, message: '整改任务写入失败，已整体回退，请重试' }
  }
  return { ok: true, message: `整改任务已${action}，当前状态「${target}」` }
}
