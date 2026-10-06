import type { EntryRow, Identity } from './types'

// 验收报告与整改台账共用的权限口径，全系统只有这一处判定，页面与服务层都从这里取结论。
//
// 归属一律按行上「登记时的单位与区域」解释：历史报告不随现行组织调整、单位撤并重算归属，
// 行上记的是什么单位，就按什么单位判。
//
// 三层权限（自外向内）：
//   1. 跨区域只读：区域不一致，一切写操作关闭；
//   2. 本组提交：同区域 + 归属单位 + 验收组成员，可提交会签、维护整改意见；
//   3. 组长定结论：同区域 + 归属单位 + 验收组组长，可确认通过 / 要求整改 / 驳回。

export type PermissionCheck = { ok: boolean; reason: string }

const ALLOW: PermissionCheck = { ok: true, reason: '' }

function deny(reason: string): PermissionCheck {
  return { ok: false, reason }
}

export function reportRegion(row: EntryRow): string {
  return String(row['所属区域'] ?? '')
}

export function ownerUnit(row: EntryRow): string {
  return String(row['归属单位'] ?? '')
}

export function groupLeader(row: EntryRow): string {
  return String(row['验收组组长'] ?? '')
}

export function groupMembers(row: EntryRow): string[] {
  return String(row['验收组成员'] ?? '')
    .split(/[、,，;；\s]+/)
    .filter(Boolean)
}

export function isCrossRegion(identity: Identity, row: EntryRow): boolean {
  const region = reportRegion(row)
  return region !== '' && region !== identity.region
}

/** 跨区域只读：所有写操作前先过这一层。 */
export function requireSameRegion(identity: Identity, row: EntryRow): PermissionCheck {
  if (isCrossRegion(identity, row)) {
    return deny(`跨区域只读：当前身份属于「${identity.region}」，该记录归属「${reportRegion(row)}」`)
  }
  return ALLOW
}

/** 本组提交：同区域 + 归属单位 + 验收组成员，可启动验收、提交会签、维护整改意见。 */
export function canSubmitCountersign(identity: Identity, row: EntryRow): PermissionCheck {
  const region = requireSameRegion(identity, row)
  if (!region.ok) {
    return region
  }
  if (identity.unit !== ownerUnit(row)) {
    return deny(`只有归属单位（${ownerUnit(row)}）的验收组成员才能提交`)
  }
  if (!groupMembers(row).includes(identity.name)) {
    return deny(`${identity.name} 不在本报告验收组内，不能提交`)
  }
  return ALLOW
}

/** 组长定结论：同区域 + 归属单位 + 验收组组长。 */
export function canConfirmConclusion(identity: Identity, row: EntryRow): PermissionCheck {
  const region = requireSameRegion(identity, row)
  if (!region.ok) {
    return region
  }
  if (identity.unit !== ownerUnit(row)) {
    return deny(`只有归属单位（${ownerUnit(row)}）的验收组组长才能确认结论`)
  }
  if (identity.name !== groupLeader(row)) {
    return deny(`只有验收组组长（${groupLeader(row)}）才能确认结论`)
  }
  return ALLOW
}

/** 整改回写侧：同区域 + 责任单位才能处理整改任务，其余单位只读。 */
export function canHandleRectification(identity: Identity, task: EntryRow): PermissionCheck {
  const region = requireSameRegion(identity, task)
  if (!region.ok) {
    return region
  }
  const unit = String(task['责任单位'] ?? '')
  if (identity.unit !== unit) {
    return deny(`只有责任单位（${unit}）才能处理该整改任务`)
  }
  return ALLOW
}
