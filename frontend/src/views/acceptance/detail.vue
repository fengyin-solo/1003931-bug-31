<template>
  <section class="page detail-page" data-module="acceptance-detail" v-if="report">
    <header class="page-head">
      <div>
        <h2>验收报告 {{ report.验收编号 }}</h2>
        <p class="page-desc">
          项目 {{ report.项目编号 }} · {{ report.验收类型 }} · 验收日期 {{ report.验收日期 }}
          <span class="version-tag">数据版本 v{{ report.版本 }}</span>
        </p>
      </div>
      <div class="page-actions">
        <RouterLink class="btn" to="/acceptance">返回列表</RouterLink>
      </div>
    </header>

    <div class="identity-bar">
      当前身份：<strong>{{ viewer.name }}</strong>（{{ viewer.unit }} · {{ viewer.region }} · {{ viewer.role }}）
    </div>

    <div v-if="perms?.readonly" class="notice notice-readonly">{{ perms?.readonlyReason }}</div>
    <div v-else-if="report.验收组单位 !== viewer.unit" class="notice notice-readonly">
      历史归属：该报告归属 {{ report.验收组单位 }}，仍按当时单位解释权限。
    </div>

    <div class="detail-grid">
      <article class="detail-card">
        <h3>归属信息</h3>
        <dl class="info-list">
          <dt>验收组单位</dt><dd>{{ report.验收组单位 }}</dd>
          <dt>验收组区域</dt><dd>{{ report.验收组区域 }}</dd>
          <dt>组长</dt><dd>{{ report.验收组组长 }}</dd>
          <dt>组员</dt><dd>{{ report.验收组成员.join('、') }}</dd>
          <dt>承建单位</dt><dd>{{ report.承建单位 }}（{{ report.承建区域 }}）</dd>
        </dl>
      </article>

      <article class="detail-card">
        <h3>结论信息</h3>
        <dl class="info-list">
          <dt>当前状态</dt>
          <dd><span :class="['status-tag', statusClass(report.status)]">{{ report.status }}</span></dd>
          <dt>验收结论</dt><dd>{{ report.验收结论 || '待组长确认' }}</dd>
          <dt>整改意见</dt><dd>{{ report.整改意见 || '—' }}</dd>
          <dt>确认人</dt><dd>{{ report.确认人 || '—' }}</dd>
          <dt>确认时间</dt><dd>{{ formatTime(report.确认时间) }}</dd>
          <dt>整改台账事项</dt>
          <dd>
            <RouterLink v-if="report.整改任务编号" class="link" :to="`/rectification?acceptance=${report.验收编号}`">
              {{ report.整改任务编号 }}
            </RouterLink>
            <span v-else>—</span>
          </dd>
        </dl>
      </article>
    </div>

    <article class="detail-card">
      <h3>会签记录（本组提交）</h3>
      <table class="data-table" v-if="report.会签记录.length">
        <thead>
          <tr><th>成员</th><th>单位</th><th>意见</th><th>说明</th><th>时间</th></tr>
        </thead>
        <tbody>
          <tr v-for="(item, index) in report.会签记录" :key="index">
            <td>{{ item.成员 }}</td>
            <td>{{ item.单位 }}</td>
            <td><span :class="['opinion-tag', opinionClass(item.意见)]">{{ item.意见 }}</span></td>
            <td>{{ item.说明 }}</td>
            <td>{{ formatTime(item.时间) }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="empty-state">尚无人会签</p>
    </article>

    <article v-if="perms?.canStart" class="detail-card action-card">
      <h3>组长操作</h3>
      <button class="btn primary" type="button" @click="doStart">启动验收（开启会签通道）</button>
    </article>

    <article v-if="perms?.canCountersign" class="detail-card action-card">
      <h3>提交会签意见 <span class="card-hint">本组提交，重复提交只覆盖本人意见</span></h3>
      <form class="inline-form" @submit.prevent="doCountersign">
        <label class="filter-item">
          <span>会签意见</span>
          <select v-model="signForm.opinion">
            <option value="通过">通过</option>
            <option value="要求整改">要求整改</option>
            <option value="驳回">驳回</option>
          </select>
        </label>
        <label class="filter-item grow">
          <span>会签说明</span>
          <input v-model="signForm.remark" placeholder="填写会签依据与说明" />
        </label>
        <button class="btn primary" type="submit">{{ perms?.signedByMe ? '更新我的会签' : '提交会签' }}</button>
      </form>
    </article>

    <article v-if="perms?.canFinalize" class="detail-card action-card">
      <h3>组长确认结论 <span class="card-hint">通过/驳回/整改并存提交时只接受一个版本（v{{ report.版本 }}）</span></h3>
      <form class="inline-form" @submit.prevent="doFinalize">
        <label class="filter-item">
          <span>最终结论</span>
          <select v-model="finalForm.verdict">
            <option value="通过">确认通过</option>
            <option value="要求整改">要求整改</option>
            <option value="驳回">驳回</option>
          </select>
        </label>
        <label v-if="finalForm.verdict === '要求整改'" class="filter-item grow">
          <span>整改意见（随结论写入台账，写入后只读）</span>
          <input v-model="finalForm.opinion" placeholder="写明须整改的问题与要求" />
        </label>
        <button class="btn primary" type="submit">确认结论</button>
      </form>
      <p class="card-hint">
        确认为「要求整改」时，旁路业务面的整改台账将自动新增一条事项；重复确认不会多开。
      </p>
    </article>

    <article v-if="!perms?.readonly && !perms?.canCountersign && !perms?.canFinalize && !perms?.canStart" class="detail-card">
      <p class="card-hint">结论已确认，会签通道关闭。{{ report.整改任务编号 ? '整改事项已在整改台账中跟踪。' : '' }}</p>
    </article>

    <footer class="page-foot">
      <span v-if="notice" :class="noticeClass">{{ notice }}</span>
    </footer>
  </section>

  <section v-else class="page">
    <p class="empty-state">没有找到该验收报告，<RouterLink class="link" to="/acceptance">返回列表</RouterLink></p>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import { acceptancePermissions } from '@/data/access-policy'
import {
  countersign,
  finalizeAcceptance,
  getAcceptance,
  startAcceptance,
  type FinalVerdict,
} from '@/data/acceptance-service'
import { useSessionStore } from '@/stores/session'

const route = useRoute()
const store = useSessionStore()
const viewer = computed(() => store.viewer)

const reportId = Number(route.params.id)
const versionAtLoad = ref(0)
const report = ref(getAcceptance(reportId))
const notice = ref('')
const noticeKind = ref<'ok' | 'err'>('ok')

const signForm = reactive({ opinion: '通过' as FinalVerdict, remark: '' })
const finalForm = reactive({ verdict: '通过' as FinalVerdict, opinion: '' })

const perms = computed(() =>
  report.value ? acceptancePermissions(viewer.value, report.value) : null,
)

function reload() {
  report.value = getAcceptance(reportId)
  if (report.value) {
    versionAtLoad.value = Number(report.value.版本)
  }
  notice.value = ''
}

function flash(message: string, ok: boolean) {
  notice.value = message
  noticeKind.value = ok ? 'ok' : 'err'
}

function doStart() {
  const result = startAcceptance(viewer.value, reportId)
  flash(result.message, result.ok)
  if (result.ok) {
    reload()
  }
}

function doCountersign() {
  const result = countersign(viewer.value, reportId, signForm.opinion, signForm.remark)
  flash(result.message, result.ok)
  if (result.ok) {
    signForm.remark = ''
    reload()
  }
}

function doFinalize() {
  const result = finalizeAcceptance(viewer.value, reportId, {
    verdict: finalForm.verdict,
    opinion: finalForm.opinion,
    // 提交详情页加载时持有的版本；并存的另一个结论先落库后，这里版本对不上会被拒绝
    expectedVersion: versionAtLoad.value,
  })
  flash(result.message, result.ok)
  if (result.ok) {
    finalForm.opinion = ''
    reload()
  } else if (result.code === 'VERSION_CONFLICT') {
    reload()
  }
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

function opinionClass(opinion: string): string {
  return { 通过: 'st-done', 整改: 'st-warn', 要求整改: 'st-warn', 驳回: 'st-reject' }[opinion] ?? ''
}

function formatTime(value: string): string {
  if (!value) {
    return '—'
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
}

const noticeClass = computed(() => (noticeKind.value === 'ok' ? 'ok-text' : 'error-text'))

watch(() => store.viewer.name, reload)
</script>
