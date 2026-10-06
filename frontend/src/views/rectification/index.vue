<template>
  <section class="page" data-module="rectification">
    <header class="page-head">
      <div>
        <h2>整改跟踪管理</h2>
        <p class="page-desc">维护整改任务，围绕任务编号、验收编号、整改内容、责任单位做登记、筛选与状态流转。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记整改任务</button>
        <button class="btn" type="button" @click="exportRows">导出整改跟踪清单</button>
      </div>
    </header>

    <p class="notice-bar">
      当前身份：{{ identity.name }}（{{ identity.unit }} · {{ identity.region }}）。
      权限口径：仅责任单位可处理整改任务，跨区域只读；验收结论确认后整改事项由验收链路自动开具。
    </p>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
    </p>

    <form class="filter-bar" @submit.prevent="reload">
      <label v-for="field in filterFields" :key="field" class="filter-item">
        <span>{{ field }}</span>
        <input v-model="filters[field]" :placeholder="`按${field}检索`" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)">
          <td v-for="column in columns" :key="column">{{ row[column] ?? '—' }}</td>
          <td>{{ row.status }}</td>
          <td class="row-actions">
            <template v-if="handleCheck(row).ok">
              <button
                v-for="action in actions"
                :key="action"
                class="link"
                type="button"
                @click="runAction(action, row)"
              >
                {{ action }}
              </button>
            </template>
            <span v-else class="legend-item">{{ handleCheck(row).reason }}</span>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 2" class="empty-state">暂无整改跟踪数据，可先登记整改任务</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条整改跟踪记录</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
      <span v-if="okMessage" class="ok-text">{{ okMessage }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { runRectificationAction } from '@/api/acceptance-service'
import { downloadEntries, listEntries, moduleMeta } from '@/api/local-service'
import { canHandleRectification } from '@/data/permissions'
import type { EntryRow } from '@/data/types'
import { useSessionStore } from '@/stores/session'

const meta = moduleMeta('rectification')
const columns = ["任务编号", "验收编号", "整改内容", "责任单位", "所属区域", "整改期限", "整改措施", "复核人"]
const actions = ["开始整改", "提交复核", "确认复核"]
const statuses = ["待整改", "整改中", "已整改", "已复核", "逾期未改"]
const stats = [{"label": "待整改数", "value": 0}, {"label": "整改中数", "value": 0}, {"label": "逾期未改数", "value": 0}]

const store = useSessionStore()
const identity = computed(() => store.identity)

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const okMessage = ref('')
const filters = ref<Record<string, string>>({})
const filterFields = columns.slice(0, 3)
const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

function handleCheck(row: EntryRow) {
  return canHandleRectification(identity.value, row)
}

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function openCreate() {
  errorMessage.value = '整改任务由验收结论确认后自动开具，不单独登记'
}

function runAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  okMessage.value = ''
  const result = runRectificationAction(Number(row.id), identity.value, action)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  okMessage.value = result.message
  reload()
}

function reload() {
  errorMessage.value = ''
  try {
    const payload = listEntries(meta.key, filters.value)
    rows.value = payload.items
    total.value = payload.total
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '整改跟踪列表读取失败'
  }
}

onMounted(reload)
</script>
