<template>
  <section class="page" data-module="rectification">
    <header class="page-head">
      <div>
        <h2>整改跟踪管理（整改台账）</h2>
        <p class="page-desc">
          台账事项由验收结论自动新增；整改意见为结论快照只读，责任单位填报措施并提交复核，验收组组长确认复核；其他单位与跨区域只读。
        </p>
      </div>
      <div class="page-actions">
        <button class="btn" type="button" @click="exportRows">导出整改跟踪清单</button>
      </div>
    </header>

    <div class="identity-bar">
      当前身份：<strong>{{ viewer.name }}</strong>（{{ viewer.unit }} · {{ viewer.region }} · {{ viewer.role }}）
      <span class="identity-hint">非责任单位、非验收组组长均为只读，且任何单位都不能修改整改意见</span>
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
          <th>当前状态</th>
          <th>权限</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <template v-for="row in rows" :key="String(row.id)">
          <tr :class="{ 'row-highlight': highlightCode && row.验收编号 === highlightCode }">
            <td v-for="column in columns" :key="column">
              <template v-if="column === '整改意见'">
                <span class="readonly-field" title="整改意见为验收结论快照，只读不可改">{{ row.整改意见 || '—' }}</span>
              </template>
              <template v-else-if="column === '整改措施'">
                <span v-if="!permissions(row).canFill">{{ row.整改措施 || '—' }}</span>
                <input v-else v-model="drafts[row.id]" class="measure-input" placeholder="填报整改措施" />
              </template>
              <template v-else>{{ row[column] || '—' }}</template>
            </td>
            <td><span :class="['status-tag', statusClass(row.status)]">{{ row.status }}</span></td>
            <td>
              <span v-if="permissions(row).readonly" class="perm-readonly">只读</span>
              <span v-else-if="permissions(row).isOwner" class="perm-owner">责任单位</span>
              <span v-else class="perm-group">验收组长</span>
            </td>
            <td class="row-actions">
              <button
                v-if="permissions(row).canFill"
                class="link"
                type="button"
                @click="saveMeasures(row)"
              >
                保存措施
              </button>
              <button
                v-if="permissions(row).canSubmit"
                class="link"
                type="button"
                @click="doSubmit(row)"
              >
                提交复核
              </button>
              <button
                v-if="permissions(row).canReview"
                class="link"
                type="button"
                @click="doReview(row)"
              >
                确认复核
              </button>
              <span v-if="permissions(row).readonly" class="action-none">无可执行动作</span>
            </td>
          </tr>
          <tr v-if="permissions(row).readonly" class="reason-row">
            <td :colspan="columns.length + 3" class="readonly-reason">{{ permissions(row).readonlyReason }}</td>
          </tr>
        </template>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 3" class="empty-state">暂无整改任务；验收结论确认「要求整改」后会自动新增</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条整改任务</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import { downloadEntries } from '@/api/local-service'
import { rectificationPermissions } from '@/data/access-policy'
import { listAcceptance } from '@/data/acceptance-service'
import {
  confirmReview,
  fillMeasures,
  listRectification,
  submitReview,
} from '@/data/rectification-service'
import { useSessionStore } from '@/stores/session'
import type { RectificationRow } from '@/data/types'

const route = useRoute()
const store = useSessionStore()
const viewer = computed(() => store.viewer)

const columns = ['任务编号', '验收编号', '整改意见', '责任单位', '整改期限', '整改措施', '复核人']
const statuses = ['待整改', '整改中', '已整改', '已复核']
const filterFields = ['任务编号', '验收编号', '责任单位']

const rows = ref<RectificationRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const filters = ref<Record<string, string>>({ '验收编号': String(route.query.acceptance ?? '') })
const drafts = reactive<Record<number, string>>({})
const highlightCode = ref(String(route.query.acceptance ?? ''))

const stats = computed(() => [
  { label: '待整改数', value: rows.value.filter((row) => row.status === '待整改').length },
  { label: '整改中数', value: rows.value.filter((row) => row.status === '整改中').length },
  { label: '待复核数', value: rows.value.filter((row) => row.status === '已整改').length },
])

const statusSummary = computed(() =>
  statuses.map((status) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

function reports() {
  return listAcceptance()
}

function permissions(row: RectificationRow) {
  return rectificationPermissions(viewer.value, row, reports())
}

function statusClass(status: string): string {
  return {
    待整改: 'st-pending',
    整改中: 'st-doing',
    已整改: 'st-warn',
    已复核: 'st-done',
  }[status] ?? ''
}

function resetFilters() {
  filters.value = {}
  highlightCode.value = ''
  reload()
}

function exportRows() {
  downloadEntries('rectification')
}

function saveMeasures(row: RectificationRow) {
  const result = fillMeasures(viewer.value, row.id, drafts[row.id] ?? '')
  errorMessage.value = result.ok ? '' : result.message
  if (result.ok) {
    reload()
  }
}

function doSubmit(row: RectificationRow) {
  const result = submitReview(viewer.value, row.id)
  errorMessage.value = result.ok ? '' : result.message
  if (result.ok) {
    reload()
  }
}

function doReview(row: RectificationRow) {
  const result = confirmReview(viewer.value, row.id)
  errorMessage.value = result.ok ? '' : result.message
  if (result.ok) {
    reload()
  }
}

function reload() {
  errorMessage.value = ''
  try {
    const matched = listRectification().filter((row) =>
      Object.entries(filters.value)
        .filter(([, value]) => value.trim() !== '')
        .every(([field, value]) => String(row[field as keyof RectificationRow] ?? '').includes(value.trim())),
    )
    rows.value = matched
    total.value = matched.length
    for (const row of matched) {
      if (drafts[row.id] === undefined) {
        drafts[row.id] = row.整改措施
      }
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '整改跟踪列表读取失败'
  }
}

watch(() => store.viewer.name, reload)
onMounted(reload)
</script>
