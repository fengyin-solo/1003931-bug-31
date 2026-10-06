import { defineStore } from 'pinia'

import { DEFAULT_VIEWER, DEMO_VIEWERS } from '@/data/identity'
import type { Viewer } from '@/data/types'

export const useSessionStore = defineStore('session', {
  state: () => ({
    viewer: { ...DEFAULT_VIEWER } as Viewer,
    shiftLabel: '白班 08:00-20:00',
    scope: '地质灾害隐患点监测防治管理系统',
  }),
  getters: {
    operator: (state) => state.viewer.name,
    canOperate: (state) => state.viewer.name.length > 0,
    viewers: () => DEMO_VIEWERS,
  },
  actions: {
    setShift(label: string) {
      this.shiftLabel = label
    },
    switchViewer(viewer: Viewer) {
      this.viewer = { ...viewer }
    },
  },
})
