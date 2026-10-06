import { defineStore } from 'pinia'

import type { Identity } from '@/data/types'

// 演示身份：覆盖三层权限判定需要的各种位置——组长、组员、非组成员、跨区域用户。
export const IDENTITY_PRESETS: (Identity & { label: string })[] = [
  { name: '张云', unit: '市地质环境监测站', region: '城东片区', label: '张云 · 验收组组长（市地质环境监测站 / 城东片区）' },
  { name: '李磊', unit: '市地质环境监测站', region: '城东片区', label: '李磊 · 验收组成员（市地质环境监测站 / 城东片区）' },
  { name: '赵强', unit: '市地质环境监测站', region: '城东片区', label: '赵强 · 非验收组成员（市地质环境监测站 / 城东片区）' },
  { name: '孙丽', unit: '城西片区管理所', region: '城西片区', label: '孙丽 · 跨区域用户（城西片区管理所 / 城西片区）' },
]

export const useSessionStore = defineStore('session', {
  state: () => ({
    operator: IDENTITY_PRESETS[0].name,
    unit: IDENTITY_PRESETS[0].unit,
    region: IDENTITY_PRESETS[0].region,
    shiftLabel: '白班 08:00-20:00',
    scope: '地质灾害隐患点监测防治管理系统',
  }),
  getters: {
    identity: (state): Identity => ({ name: state.operator, unit: state.unit, region: state.region }),
    canOperate: (state) => state.operator.length > 0,
  },
  actions: {
    setShift(label: string) {
      this.shiftLabel = label
    },
    switchIdentity(name: string) {
      const preset = IDENTITY_PRESETS.find((item) => item.name === name)
      if (preset) {
        this.operator = preset.name
        this.unit = preset.unit
        this.region = preset.region
      }
    },
  },
})
