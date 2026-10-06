<template>
  <section class="page" data-module="acceptance-detail">
    <header class="page-head">
      <div>
        <h2>验收报告详情</h2>
        <p class="page-desc">
          <RouterLink class="link" to="/acceptance">← 返回工程验收列表</RouterLink>
        </p>
      </div>
    </header>

    <p v-if="!detail" class="empty-state">没有找到该验收报告，可能已被移除。</p>

    <template v-else>
      <p v-if="crossRegion" class="readonly-bar">
        跨区域只读：当前身份属于「{{ identity.region }}」，该报告归属「{{ report['所属区域'] }}」，仅可查看。
      </p>
      <p v-else class="notice-bar">
        当前身份：{{ identity.name }}（{{ identity.unit }} · {{ identity.region }}）。
        权限口径：本组成员提交会签与整改意见、组长确认结论；归属按登记时的单位解释。
      </p>

      <div class="detail-grid">
        <article class="detail-card">
          <h3>报告信息</h3>
          <dl>
            <dt>验收编号</dt><dd>{{ report['验收编号'] }}</dd>
            <dt>项目编号</dt><dd>{{ report['项目编号'] }}</dd>
            <dt>验收类型</dt><dd>{{ report['验收类型'] }}</dd>
            <dt>验收日期</dt><dd>{{ report['验收日期'] }}</dd>
            <dt>当前状态</dt><dd>{{ report.status }}</dd>
            <dt>验收结论</dt><dd>{{ report['验收结论'] || '—' }}</dd>
          </dl>
        </article>
        <article class="detail-card">
          <h3>归属信息（按登记时解释）</h3>
          <dl>
            <dt>归属单位</dt><dd>{{ report['归属单位'] }}</dd>
            <dt>所属区域</dt><dd>{{ report['所属区域'] }}</dd>
            <dt>验收组组长</dt><dd>{{ report['验收组组长'] }}</dd>
            <dt>验收组成员</dt><dd>{{ report['验收组成员'] }}</dd>
            <template v-if="confirmed">
              <dt>结论确认人</dt><dd>{{ report['结论确认人'] }}</dd>
              <dt>确认时间</dt><dd>{{ report['结论确认时间'] }}</dd>
            </template>
          </dl>
        </article>
      </div>

      <article class="detail-card">
        <h3>会签记录</h3>
        <p v-if="!detail.countersigns.length" class="empty-state">暂无会签记录</p>
        <div v-for="item in detail.countersigns" :key="item.member" class="countersign-item">
          <strong>{{ item.member }}</strong>
          <span class="countersign-meta">{{ item.unit }} · {{ item.time }}</span>
          <div>{{ item.opinion }}</div>
        </div>
        <form v-if="canCountersign" class="form-row" @submit.prevent="submitSign">
          <textarea v-model="signOpinion" rows="2" placeholder="填写会签意见（本组成员一人一签，重复提交覆盖本人上次意见）"></textarea>
          <button class="btn primary" type="submit">提交会签</button>
        </form>
        <p v-else-if="!crossRegion && !confirmed" class="page-desc">{{ countersignHint }}</p>
      </article>

      <article class="detail-card">
        <h3>整改意见</h3>
        <p v-if="confirmed || !canEditOpinion">{{ report['整改意见'] || '—' }}</p>
        <form v-if="canEditOpinion" class="form-row" @submit.prevent="saveOpinion">
          <textarea v-model="opinionDraft" rows="2" placeholder="结论确认前可由本组成员修订整改意见"></textarea>
          <button class="btn" type="submit">保存整改意见</button>
        </form>
      </article>

      <article v-if="!confirmed" class="detail-card">
        <h3>结论确认（仅验收组组长）</h3>
        <template v-if="canConfirm">
          <div class="form-row">
            <textarea v-model="conclusionOpinion" rows="2" placeholder="结论说明；选择「要求整改」时必填整改意见，确认后整改台账将自动新增事项"></textarea>
          </div>
          <div class="form-row">
            <button class="btn primary" type="button" @click="confirm('确认通过')">确认通过</button>
            <button class="btn" type="button" @click="confirm('要求整改')">要求整改</button>
            <button class="btn ghost" type="button" @click="confirm('驳回结论')">驳回结论</button>
          </div>
        </template>
        <p v-else class="page-desc">{{ confirmDenyReason }}</p>
      </article>

      <article class="detail-card">
        <h3>关联整改任务</h3>
        <table v-if="detail.rectifications.length" class="data-table">
          <thead>
            <tr>
              <th>任务编号</th>
              <th>整改内容</th>
              <th>责任单位</th>
              <th>整改期限</th>
              <th>当前状态</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="task in detail.rectifications" :key="String(task.id)">
              <td>{{ task['任务编号'] }}</td>
              <td>{{ task['整改内容'] }}</td>
              <td>{{ task['责任单位'] }}</td>
              <td>{{ task['整改期限'] }}</td>
              <td>{{ task.status }}</td>
            </tr>
          </tbody>
        </table>
        <p v-else class="empty-state">暂无关联整改任务；结论确认为「需整改」时会自动新增</p>
      </article>

      <footer class="page-foot">
        <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
        <span v-if="okMessage" class="ok-text">{{ okMessage }}</span>
      </footer>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import {
  confirmConclusion,
  getAcceptanceDetail,
  submitCountersign,
  updateRectificationOpinion,
} from '@/api/acceptance-service'
import {
  canConfirmConclusion,
  canSubmitCountersign,
  isCrossRegion,
} from '@/data/permissions'
import type { CountersignRecord, EntryRow } from '@/data/types'
import { useSessionStore } from '@/stores/session'

const route = useRoute()
const store = useSessionStore()
const identity = computed(() => store.identity)

const detail = ref<{ report: EntryRow; countersigns: CountersignRecord[]; rectifications: EntryRow[] } | null>(null)
const signOpinion = ref('')
const opinionDraft = ref('')
const conclusionOpinion = ref('')
const errorMessage = ref('')
const okMessage = ref('')

const report = computed(() => detail.value?.report ?? ({} as EntryRow))
const confirmed = computed(() => String(report.value['结论确认人'] ?? '') !== '')
const crossRegion = computed(() => isCrossRegion(identity.value, report.value))
const canCountersign = computed(
  () => !confirmed.value && canSubmitCountersign(identity.value, report.value).ok && report.value.status !== '待验收',
)
const countersignHint = computed(() => {
  if (report.value.status === '待验收' && canSubmitCountersign(identity.value, report.value).ok) {
    return '报告待验收：请本组成员先在列表页启动验收，再提交会签。'
  }
  return canSubmitCountersign(identity.value, report.value).reason
})
const canEditOpinion = computed(() => !confirmed.value && canSubmitCountersign(identity.value, report.value).ok)
const canConfirm = computed(() => !confirmed.value && canConfirmConclusion(identity.value, report.value).ok)
const confirmDenyReason = computed(() => canConfirmConclusion(identity.value, report.value).reason)

function applyResult(result: { ok: boolean; message: string }) {
  reload()
  if (result.ok) {
    okMessage.value = result.message
  } else {
    errorMessage.value = result.message
  }
}

function submitSign() {
  applyResult(submitCountersign(reportId(), identity.value, signOpinion.value))
  signOpinion.value = ''
}

function saveOpinion() {
  applyResult(updateRectificationOpinion(reportId(), identity.value, opinionDraft.value))
}

function confirm(action: string) {
  applyResult(confirmConclusion(reportId(), identity.value, action, conclusionOpinion.value))
  conclusionOpinion.value = ''
}

function reportId(): number {
  return Number(route.params.id)
}

function reload() {
  errorMessage.value = ''
  okMessage.value = ''
  detail.value = getAcceptanceDetail(reportId())
  opinionDraft.value = String(detail.value?.report['整改意见'] ?? '')
}

onMounted(reload)
</script>
