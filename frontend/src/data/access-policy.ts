import type { AcceptanceRow, RectificationRow, Viewer } from '@/data/types'

/**
 * 统一权限口径：验收报告的列表、详情、整改三个页面都只从这里取判定结果，
 * 避免各页面各写一套判断导致「非本组成员能提交结论、其他单位能改整改意见」这类归属错位。
 *
 * 三层：
 * - 本组组员：可参与会签（本组提交）
 * - 本组组长：可启动验收、定结论、复核
 * - 跨区域 / 其他单位：只读，整改页也只能看，改不了意见和措施
 *
 * 归属按报告上的归属快照解释（验收组单位/区域），历史报告仍按当时单位，不随机构撤并漂移。
 */

export type AcceptancePermissions = {
  /** 跨区域或其他单位：三层里的只读层 */
  readonly: boolean
  /** 本组成员（组长也算成员，详情页的会签列表里有他一票） */
  inGroup: boolean
  canStart: boolean
  canCountersign: boolean
  canFinalize: boolean
  /** 当前登录人是否已投过会签票 */
  signedByMe: boolean
  readonlyReason: string
}

export type RectificationPermissions = {
  readonly: boolean
  isOwner: boolean
  canFill: boolean
  canSubmit: boolean
  canReview: boolean
  readonlyReason: string
}

function isOwnGroup(viewer: Viewer, row: Pick<AcceptanceRow, '验收组单位' | '验收组区域'>): boolean {
  return viewer.unit === row.验收组单位 && viewer.region === row.验收组区域
}

/** 整改任务的归属看验收报告：责任单位是结论定整改时派发给报告承建单位的。 */
function reportOf(task: RectificationRow, reports: AcceptanceRow[]): AcceptanceRow | undefined {
  return reports.find((report) => report.验收编号 === task.验收编号)
}

export function acceptancePermissions(
  viewer: Viewer,
  row: AcceptanceRow,
): AcceptancePermissions {
  const inGroup = isOwnGroup(viewer, row)
  const leader = inGroup && viewer.role === '组长'
  const signedByMe = row.会签记录.some((item) => item.成员 === viewer.name && item.单位 === viewer.unit)
  const open = row.status === '验收中'

  let readonlyReason = ''
  if (!inGroup) {
    readonlyReason =
      viewer.region !== row.验收组区域
        ? `跨区域只读：${viewer.unit}（${viewer.region}）不属于本验收组，仅可查看`
        : `${viewer.unit}不是本验收组成员单位，仅可查看`
  }

  return {
    readonly: !inGroup,
    inGroup,
    canStart: leader && row.status === '待验收',
    canCountersign: inGroup && open,
    canFinalize: leader && open,
    signedByMe,
    readonlyReason,
  }
}

export function rectificationPermissions(
  viewer: Viewer,
  task: RectificationRow,
  reports: AcceptanceRow[],
): RectificationPermissions {
  const report = reportOf(task, reports)
  const isOwner = viewer.unit === task.责任单位 && viewer.region === task.责任区域
  // 复核权回到验收组组长手里：跨区域、其他单位都复核不了
  const groupLeader =
    !!report &&
    viewer.unit === report.验收组单位 &&
    viewer.region === report.验收组区域 &&
    viewer.role === '组长'

  let readonlyReason = ''
  if (!isOwner && !groupLeader) {
    readonlyReason = `只读：${viewer.unit}不是该任务的责任单位，也非验收组组长，整改意见与措施均不可修改`
  }

  return {
    readonly: !isOwner && !groupLeader,
    isOwner,
    canFill: isOwner && (task.status === '待整改' || task.status === '整改中'),
    canSubmit: isOwner && task.status === '整改中',
    canReview: groupLeader && task.status === '已整改',
    readonlyReason,
  }
}

/** 整改意见是验收结论的一部分：只允许本组组长在定结论（要求整改）时写入，台账侧永远只读。 */
export function canWriteRectificationOpinion(
  viewer: Viewer,
  report: AcceptanceRow,
): boolean {
  return (
    viewer.unit === report.验收组单位 &&
    viewer.region === report.验收组区域 &&
    viewer.role === '组长'
  )
}
