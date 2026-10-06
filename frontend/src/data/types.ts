/** 纯前端数据层的公共类型：与全栈版后端返回的结构保持一致，换回后端时页面不用改。 */

export type EntryRow = {
  id: number
  status: string
  pending: boolean
  abnormal: boolean
  [field: string]: unknown
}

/** 验收/整改链路里的行带有数组与结构化字段，索引签名放宽到 unknown，业务侧用下面的精确类型收口。 */
export type ModuleMeta = {
  key: string
  name: string
  entity: string
  desc: string
  fields: string[]
  statuses: string[]
  actions: string[]
  actionTargets: Record<string, string>
  metrics: string[]
}

export type PageResult = {
  items: EntryRow[]
  total: number
  page: number
  size: number
}

/** code 用来区分无权、状态不对、版本冲突等不同失败，页面按 code 决定提示方式。 */
export type ActionResult = {
  ok: boolean
  message: string
  code?: 'FORBIDDEN' | 'NOT_FOUND' | 'STATE' | 'VERSION_CONFLICT' | 'INVALID'
  taskCode?: string
}

export type OverviewResult = {
  cards: { label: string; value: number }[]
  modules: { name: string; created: number; pending: number; abnormal: number }[]
}

/** 身份与权限口径：本组（同单位同区域）分组长/组员，跨区域与其他单位一律只读。 */
export type RoleLevel = '组长' | '组员' | '跨区域' | '其他'

export type Viewer = {
  name: string
  unit: string
  region: string
  role: RoleLevel
}

/** 会签动作：组员/组长在组长定结论之前各投一票，同一人再次提交覆盖自己的旧票。 */
export type CountersignEntry = {
  成员: string
  单位: string
  意见: '通过' | '驳回' | '要求整改'
  说明: string
  时间: string
}

/** 验收报告：归属单位/区域是归属快照，历史报告永远按当时单位解释，不随后续机构撤并改变。 */
export type AcceptanceRow = EntryRow & {
  验收编号: string
  项目编号: string
  验收类型: string
  验收日期: string
  验收组单位: string
  验收组区域: string
  验收组组长: string
  验收组成员: string[]
  验收结论: '' | '通过' | '驳回' | '要求整改'
  整改意见: string
  确认人: string
  确认时间: string
  整改任务编号: string
  承建单位: string
  承建区域: string
  版本: number
  会签记录: CountersignEntry[]
}

/** 整改任务（旁路业务面的整改台账）：整改意见是验收结论时写入的快照，台账侧只读。 */
export type RectificationRow = EntryRow & {
  任务编号: string
  验收编号: string
  整改内容: string
  整改意见: string
  责任单位: string
  责任区域: string
  整改期限: string
  整改措施: string
  复核人: string
}
