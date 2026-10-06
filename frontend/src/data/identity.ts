import type { Viewer } from '@/data/types'

/**
 * 演示身份：纯前端没有登录态，用切换身份来演示三层权限口径。
 * 接回后端时换成当前登录人即可，权限策略函数的入参签名不用动。
 */
export const DEMO_VIEWERS: Viewer[] = [
  { name: '王立群', unit: '县地质灾害防治中心', region: '本县', role: '组长' },
  { name: '李婉清', unit: '县地质灾害防治中心', region: '本县', role: '组员' },
  { name: '赵承志', unit: '邻县自然资源局', region: '邻县', role: '跨区域' },
  { name: '周建华', unit: '宏基岩土工程有限公司', region: '本县', role: '其他' },
  { name: '孙守业', unit: '北山乡自然资源所', region: '本县', role: '组长' },
]

export const DEFAULT_VIEWER: Viewer = DEMO_VIEWERS[0]
