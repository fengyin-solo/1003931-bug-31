<template>
  <section class="page" data-module="acceptance">
    <header class="page-head">
      <div>
        <h2>工程验收管理</h2>
        <p class="page-desc">维护验收报告，围绕验收编号、项目编号、验收类型、验收日期做登记、筛选与状态流转。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记验收报告</button>
        <button class="btn" type="button" @click="exportRows">导出工程验收清单</button>
      </div>
    </header>

    <p class="notice-bar">
      当前身份：{{ identity.name }}（{{ identity.unit }} · {{ identity.region }}）。
      权限口径：本组成员提交会签、组长确认结论、跨区域只读；报告归属按登记时的单位解释。
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
            <RouterLink class="link" :to="`/acceptance/${row.id}`">详情</RouterLink>
            <button
              v-if="canStart(row)"
              class="link"
              type="button"
              @click="start(row)"
            >
              启动验收
            </button>
            <span v-if="readonlyReason(row)" class="legend-item">{{ readonlyReason(row) }}</span>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 2" class="empty-state">暂无工程验收数据，可先登记验收报告</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条工程验收记录 · 结论确认请在详情页按权限操作</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
      <span v-if="okMessage" class="ok-text">{{ okMessage }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { startAcceptance } from '@/api/acceptance-service'
import { downloadEntries, listEntries, moduleMeta } from '@/api/local-service'
import { canSubmitCountersign, isCrossRegion } from '@/data/permissions'
import type { EntryRow } from '@/data/types'
import { useSessionStore } from '@/stores/session'

const meta = moduleMeta('acceptance')
const columns = ["验收编号", "项目编号", "验收类型", "验收日期", "验收组组长", "归属单位", "所属区域"]
const statuses = ["待验收", "验收中", "验收通过", "需整改", "已驳回"]
const stats = [{"label": "待验收项目", "value": 0}, {"label": "通过项目数", "value": 0}, {"label": "整改中项目", "value": 0}]

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

function canStart(row: EntryRow): boolean {
  return row.status === '待验收' && canSubmitCountersign(identity.value, row).ok
}

function readonlyReason(row: EntryRow): string {
  if (isCrossRegion(identity.value, row)) {
    return '跨区域只读'
  }
  return ''
}

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function openCreate() {
  errorMessage.value = '验收报告登记入口尚未接入审批流'
}

function start(row: EntryRow) {
  errorMessage.value = ''
  okMessage.value = ''
  const result = startAcceptance(Number(row.id), identity.value)
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
    errorMessage.value = error instanceof Error ? error.message : '工程验收列表读取失败'
  }
}

onMounted(reload)
</script>
