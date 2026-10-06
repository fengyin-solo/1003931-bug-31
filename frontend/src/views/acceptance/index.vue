<template>
  <section class="page" data-module="acceptance">
    <header class="page-head">
      <div>
        <h2>工程验收管理</h2>
        <p class="page-desc">
          三层权限：本组成员提交会签、组长确认结论、跨区域与其他单位只读；报告归属按验收组单位快照解释，历史报告仍按当时单位。
        </p>
      </div>
      <div class="page-actions">
        <button class="btn" type="button" @click="exportRows">导出工程验收清单</button>
      </div>
    </header>

    <div class="identity-bar">
      当前身份：<strong>{{ viewer.name }}</strong>（{{ viewer.unit }} · {{ viewer.region }} · {{ viewer.role }}）
      <span class="identity-hint">非本组成员仅可查看；组长才可以确认结论</span>
    </div>

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
          <th>会签</th>
          <th>当前状态</th>
          <th>权限</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)">
          <td v-for="column in columns" :key="column">{{ display(row, column) }}</td>
          <td>{{ row.会签记录.length }} 票</td>
          <td>
            <span :class="['status-tag', statusClass(row.status)]">{{ row.status }}</span>
            <span class="version-tag">v{{ row.版本 }}</span>
          </td>
          <td>
            <span v-if="permissions(row).readonly" class="perm-readonly">只读</span>
            <span v-else class="perm-group">{{ viewer.role }}</span>
          </td>
          <td class="row-actions">
            <RouterLink class="link" :to="`/acceptance/${row.id}`">
              {{ permissions(row).readonly ? '查看详情' : '处理 / 详情' }}
            </RouterLink>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 4" class="empty-state">暂无工程验收数据</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条验收报告</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

import { downloadEntries } from '@/api/local-service'
import { acceptancePermissions } from '@/data/access-policy'
import { listAcceptance } from '@/data/acceptance-service'
import { useSessionStore } from '@/stores/session'
import type { AcceptanceRow } from '@/data/types'

const store = useSessionStore()
const viewer = computed(() => store.viewer)

const columns = ['验收编号', '项目编号', '验收类型', '验收日期', '验收组单位', '验收结论', '整改任务编号']
const statuses = ['待验收', '验收中', '验收通过', '需整改', '已驳回']
const filterFields = ['验收编号', '项目编号', '验收组单位']

const rows = ref<AcceptanceRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const filters = ref<Record<string, string>>({})

const stats = computed(() => [
  { label: '待验收项目', value: rows.value.filter((row) => row.status === '待验收').length },
  { label: '验收中项目', value: rows.value.filter((row) => row.status === '验收中').length },
  { label: '通过项目数', value: rows.value.filter((row) => row.status === '验收通过').length },
  { label: '需整改项目', value: rows.value.filter((row) => row.status === '需整改').length },
])

const statusSummary = computed(() =>
  statuses.map((status) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

function permissions(row: AcceptanceRow) {
  return acceptancePermissions(viewer.value, row)
}

function display(row: AcceptanceRow, column: string): string {
  const value = row[column]
  if (Array.isArray(value)) {
    return value.join('、')
  }
  return String(value || '—')
}

function statusClass(status: string): string {
  return {
    待验收: 'st-pending',
    验收中: 'st-doing',
    验收通过: 'st-done',
    需整改: 'st-warn',
    已驳回: 'st-reject',
  }[status] ?? ''
}

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries('acceptance')
}

function reload() {
  errorMessage.value = ''
  try {
    const matched = listAcceptance().filter((row) =>
      Object.entries(filters.value)
        .filter(([, value]) => value.trim() !== '')
        .every(([field, value]) => String(row[field as keyof AcceptanceRow] ?? '').includes(value.trim())),
    )
    rows.value = matched
    total.value = matched.length
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '工程验收列表读取失败'
  }
}

watch(() => store.viewer.name, reload)
onMounted(reload)
</script>
