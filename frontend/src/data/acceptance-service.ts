import { acceptancePermissions } from '@/data/access-policy'
import { commit, listRows } from '@/data/local-store'
import type {
  AcceptanceRow,
  ActionResult,
  CountersignEntry,
  EntryRow,
  RectificationRow,
  Viewer,
} from '@/data/types'

/**
 * 验收域：报告归属 → 会签动作 → 整改回写 的完整链路都收在这里。
 * 列表/详情页只做展示和表单，不自己判权限、不直接写数据。
 */

export type FinalVerdict = '通过' | '驳回' | '要求整改'
export type CountersignOpinion = Exclude<FinalVerdict, never>

const TERMINAL = new Set(['验收通过', '已驳回', '需整改'])
const RECTIFY_DUE_DAYS = 15

function toAcceptance(row: EntryRow): AcceptanceRow {
  return row as AcceptanceRow
}

export function listAcceptance(): AcceptanceRow[] {
  return listRows('acceptance').map(toAcceptance)
}

export function getAcceptance(id: number): AcceptanceRow | undefined {
  return listAcceptance().find((row) => row.id === id)
}

export function nextTaskCode(rectRows: RectificationRow[]): string {
  const seq = rectRows.length + 1
  return `RECT-${new Date().getFullYear()}-${String(seq).padStart(3, '0')}`
}

/** 启动验收：仅本组组长、且报告处于待验收。 */
export function startAcceptance(viewer: Viewer, id: number): ActionResult {
  const report = getAcceptance(id)
  if (!report) {
    return { ok: false, code: 'NOT_FOUND', message: `没有找到编号为 ${id} 的验收报告` }
  }
  const perms = acceptancePermissions(viewer, report)
  if (!perms.canStart) {
    return { ok: false, code: 'FORBIDDEN', message: perms.readonlyReason || '仅本验收组组长可启动验收' }
  }
  const rows = listAcceptance()
  const next = rows.map((row) =>
    row.id === id
      ? { ...row, status: '验收中', pending: true, 版本: Number(row.版本) + 1 }
      : row,
  )
  commit([{ key: 'acceptance', rows: next as EntryRow[] }])
  return { ok: true, message: '验收已启动，本组成员可提交会签意见' }
}

/** 本组提交：组员（含组长）在定结论之前会签；同一人重复提交只覆盖自己那一票，不新增。 */
export function countersign(
  viewer: Viewer,
  id: number,
  opinion: CountersignOpinion,
  remark: string,
): ActionResult {
  const report = getAcceptance(id)
  if (!report) {
    return { ok: false, code: 'NOT_FOUND', message: `没有找到编号为 ${id} 的验收报告` }
  }
  const perms = acceptancePermissions(viewer, report)
  if (perms.readonly) {
    return { ok: false, code: 'FORBIDDEN', message: perms.readonlyReason }
  }
  if (!perms.canCountersign) {
    return { ok: false, code: 'STATE', message: '验收尚未开始或结论已确认，会签通道已关闭' }
  }
  if (remark.trim() === '') {
    return { ok: false, code: 'INVALID', message: '请填写会签说明后再提交' }
  }

  const entry: CountersignEntry = {
    成员: viewer.name,
    单位: viewer.unit,
    意见: opinion,
    说明: remark.trim(),
    时间: new Date().toISOString(),
  }
  const rows = listAcceptance()
  const next = rows.map((row) => {
    if (row.id !== id) {
      return row
    }
    const records = [...row.会签记录]
    const mine = records.findIndex((item) => item.成员 === viewer.name && item.单位 === viewer.unit)
    if (mine >= 0) {
      records[mine] = entry
    } else {
      records.push(entry)
    }
    return { ...row, 会签记录: records, 版本: Number(row.版本) + 1 }
  })
  commit([{ key: 'acceptance', rows: next as EntryRow[] }])
  return {
    ok: true,
    message:
      perms.signedByMe ? `已更新 ${viewer.name} 的会签意见（${opinion}）` : `会签意见（${opinion}）已记录`,
  }
}

type FinalizeInput = {
  verdict: FinalVerdict
  /** 定整改结论时必须随结论写入整改意见；通过/驳回不写台账。 */
  opinion?: string
  /** 页面持有的版本号；并存提交时后到的一方版本对不上，拒绝写入。 */
  expectedVersion: number
  /** 验收脚本注入：模拟报告写成功、整改台账写失败。 */
  persister?: (key: string, rows: EntryRow[]) => void
  now?: Date
}

/**
 * 组长定结论。一次事务同时写：
 * 1) 验收报告（结论/意见/状态/版本/确认人/任务编号）
 * 2) 旁路业务面的整改台账（仅「要求整改」时新增一条）
 *
 * 重复确认不得多开：已经有结论/已挂任务编号的报告再次确认一律拒绝；
 * 版本不一致：并存的通过和驳回只接受一个版本，另一个返回冲突；
 * 任一写入失败：两表全部回退。
 */
export function finalizeAcceptance(
  viewer: Viewer,
  id: number,
  input: FinalizeInput,
): ActionResult {
  const report = getAcceptance(id)
  if (!report) {
    return { ok: false, code: 'NOT_FOUND', message: `没有找到编号为 ${id} 的验收报告` }
  }
  const perms = acceptancePermissions(viewer, report)
  if (perms.readonly) {
    return { ok: false, code: 'FORBIDDEN', message: perms.readonlyReason }
  }
  // 版本检查放在状态检查之前：两个窗口并存提交时，后到的一方先得到「版本过期」而不是含糊的状态错误
  if (Number(input.expectedVersion) !== Number(report.版本)) {
    return {
      ok: false,
      code: 'VERSION_CONFLICT',
      message: `数据已被其他人更新（当前版本 v${report.版本}，你持有的是 v${input.expectedVersion}），请刷新后只保留一个版本`,
    }
  }
  if (viewer.role !== '组长') {
    return { ok: false, code: 'FORBIDDEN', message: '仅本验收组组长可确认验收结论' }
  }
  if (TERMINAL.has(report.status)) {
    return {
      ok: false,
      code: 'FORBIDDEN',
      message: '结论已确认，不可重复确认；如需变更请重新发起验收',
    }
  }

  const opinion = (input.opinion ?? '').trim()
  if (input.verdict === '要求整改' && opinion === '') {
    return { ok: false, code: 'INVALID', message: '要求整改时必须写明整改意见' }
  }

  const statusByVerdict: Record<FinalVerdict, string> = {
    通过: '验收通过',
    驳回: '已驳回',
    要求整改: '需整改',
  }
  const nowIso = (input.now ?? new Date()).toISOString()
  const due = new Date(input.now ?? new Date())
  due.setDate(due.getDate() + RECTIFY_DUE_DAYS)

  const acceptanceRows = listAcceptance()
  const rectRows = listRows('rectification').map((row) => row as RectificationRow)

  let taskCode = ''
  if (input.verdict === '要求整改') {
    // 幂等双保险：台账里已有同一验收编号的事项，绝不重复新增
    if (report.整改任务编号 || rectRows.some((item) => item.验收编号 === report.验收编号)) {
      return {
        ok: false,
        code: 'STATE',
        message: `该报告已生成整改台账事项 ${report.整改任务编号}，重复确认不得多开`,
      }
    }
    taskCode = nextTaskCode(rectRows)
  }

  const nextAcceptance = acceptanceRows.map((row) =>
    row.id === id
      ? {
          ...row,
          status: statusByVerdict[input.verdict],
          pending: input.verdict === '要求整改',
          abnormal: input.verdict === '驳回',
          验收结论: input.verdict,
          整改意见: input.verdict === '要求整改' ? opinion : row.整改意见,
          确认人: `${viewer.name}（${viewer.unit}）`,
          确认时间: nowIso,
          整改任务编号: taskCode || row.整改任务编号,
          版本: Number(row.版本) + 1,
        }
      : row,
  )

  const nextRect = [...rectRows]
  if (taskCode) {
    nextRect.push({
      id: rectRows.reduce((max, row) => Math.max(max, Number(row.id)), 0) + 1,
      status: '待整改',
      pending: true,
      abnormal: false,
      任务编号: taskCode,
      验收编号: report.验收编号,
      整改内容: opinion,
      // 整改意见是验收结论的快照：只随结论写入一次，责任单位在整改页只能看、改不了
      整改意见: opinion,
      责任单位: report.承建单位,
      责任区域: report.承建区域,
      整改期限: due.toISOString().slice(0, 10),
      整改措施: '',
      复核人: '',
    })
  }

  const steps = [{ key: 'acceptance', rows: nextAcceptance as EntryRow[] }]
  if (taskCode) {
    steps.push({ key: 'rectification', rows: nextRect as EntryRow[] })
  }
  commit(steps, input.persister)

  return {
    ok: true,
    taskCode: taskCode || undefined,
    message:
      input.verdict === '要求整改'
        ? `结论已确认为「需整改」，整改台账已新增事项 ${taskCode}（重复确认不会多开）`
        : `验收结论已确认为「${input.verdict}」`,
  }
}
