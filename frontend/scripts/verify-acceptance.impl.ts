import assert from 'node:assert/strict'

import { resetAllRows } from '@/data/local-store'
import {
  countersign,
  finalizeAcceptance,
  getAcceptance,
  listAcceptance,
  startAcceptance,
} from '@/data/acceptance-service'
import {
  confirmReview,
  fillMeasures,
  listRectification,
  submitReview,
} from '@/data/rectification-service'
import { acceptancePermissions, rectificationPermissions } from '@/data/access-policy'
import type { AcceptanceRow, EntryRow, Viewer } from '@/data/types'

const 组长: Viewer = { name: '王立群', unit: '县地质灾害防治中心', region: '本县', role: '组长' }
const 组员: Viewer = { name: '李婉清', unit: '县地质灾害防治中心', region: '本县', role: '组员' }
const 跨区域: Viewer = { name: '赵承志', unit: '邻县自然资源局', region: '邻县', role: '跨区域' }
const 承建方: Viewer = { name: '周建华', unit: '宏基岩土工程有限公司', region: '本县', role: '其他' }
const 历史组长: Viewer = { name: '孙守业', unit: '北山乡自然资源所', region: '本县', role: '组长' }
const 川渝经办人: Viewer = { name: '吴运发', unit: '川渝地质工程公司', region: '本县', role: '其他' }

let passed = 0
function check(title: string, fn: () => void) {
  resetAllRows()
  try {
    fn()
    passed += 1
    console.log(`  ✓ ${title}`)
  } catch (error) {
    console.error(`  ✗ ${title}`)
    console.error(error instanceof Error ? `    ${error.message}` : error)
    process.exitCode = 1
  }
}

function taskByCode(code: string) {
  return listRectification().find((item) => item.任务编号 === code)
}

// ── 第一层：本组提交（会签） ────────────────────────────────────────────────

check('非本组成员（承建方）不能提交会签结论', () => {
  const result = countersign(承建方, 2, '通过', '我觉得可以')
  assert.equal(result.ok, false)
  assert.equal(result.code, 'FORBIDDEN')
  assert.equal(getAcceptance(2)!.会签记录.length, 1)
})

check('跨区域人员不能提交会签结论', () => {
  const result = countersign(跨区域, 2, '驳回', '外县意见')
  assert.equal(result.ok, false)
  assert.equal(result.code, 'FORBIDDEN')
})

check('组员可以会签，组长身份仅组长可启动验收', () => {
  assert.equal(countersign(组员, 2, '通过', '现场复核合格').ok, true)
  // 组员不能启动待验收报告
  assert.equal(startAcceptance(组员, 1).ok, false)
  assert.equal(startAcceptance(组长, 1).ok, true)
  assert.equal(getAcceptance(1)!.status, '验收中')
})

check('同一人重复会签只覆盖本人意见，不会多一票', () => {
  countersign(组员, 2, '通过', '第一次意见')
  countersign(组员, 2, '要求整改', '改判整改')
  const report = getAcceptance(2)!
  const mine = report.会签记录.filter((item) => item.成员 === 组员.name)
  assert.equal(mine.length, 1)
  assert.equal(mine[0].意见, '要求整改')
})

// ── 第二层：组长定结论 ──────────────────────────────────────────────────────

check('组员不能定结论，只有组长能确认', () => {
  const result = finalizeAcceptance(组员, 2, { verdict: '通过', expectedVersion: 2 })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'FORBIDDEN')
  assert.equal(getAcceptance(2)!.status, '验收中')
})

check('跨区域/承建方不能定结论', () => {
  assert.equal(finalizeAcceptance(跨区域, 2, { verdict: '通过', expectedVersion: 2 }).ok, false)
  assert.equal(finalizeAcceptance(承建方, 2, { verdict: '通过', expectedVersion: 2 }).ok, false)
})

check('结论定整改：必须写整改意见，且整改台账只新增一条事项', () => {
  const result = finalizeAcceptance(组长, 2, { verdict: '要求整改', opinion: '泄水孔须按图整改', expectedVersion: 2 })
  assert.equal(result.ok, true)
  const report = getAcceptance(2)!
  assert.equal(report.status, '需整改')
  assert.equal(report.验收结论, '要求整改')
  assert.ok(report.整改任务编号)
  const linked = listRectification().filter((item) => item.验收编号 === 'ACCE-2026-020')
  assert.equal(linked.length, 1)
  assert.equal(linked[0].责任单位, '宏基岩土工程有限公司')
  assert.equal(linked[0].整改意见, '泄水孔须按图整改')
})

check('重复确认不得多开：同一报告第二次确认被拒，台账不增加', () => {
  finalizeAcceptance(组长, 2, { verdict: '要求整改', opinion: '第一次', expectedVersion: 2 })
  const countAfterFirst = listRectification().length
  const again = finalizeAcceptance(组长, 2, {
    verdict: '要求整改',
    opinion: '第二次确认',
    expectedVersion: 3,
  })
  assert.equal(again.ok, false)
  assert.equal(listRectification().length, countAfterFirst)
  assert.equal(getAcceptance(2)!.整改意见, '第一次')
})

check('通过/驳回结论不开整改台账事项', () => {
  const before = listRectification().length
  const pass = finalizeAcceptance(组长, 2, { verdict: '通过', expectedVersion: 2 })
  assert.equal(pass.ok, true)
  assert.equal(listRectification().length, before)
  assert.equal(getAcceptance(2)!.整改任务编号, '')
})

check('并存提交只接受一个版本：先到的通过落库，后到的驳回版本冲突被拒', () => {
  // 两个组长窗口同时持有 v2：A 提交通过先落库（版本变 v3）
  assert.equal(finalizeAcceptance(组长, 2, { verdict: '通过', expectedVersion: 2 }).ok, true)
  // B 仍拿着旧版本号提交驳回
  const stale = finalizeAcceptance(组长, 2, { verdict: '驳回', expectedVersion: 2 })
  assert.equal(stale.ok, false)
  assert.equal(stale.code, 'VERSION_CONFLICT')
  // 只保留先到的版本：通过、未被标异常
  const report = getAcceptance(2)!
  assert.equal(report.status, '验收通过')
  assert.equal(report.abnormal, false)
})

// ── 第三层：跨区域只读 + 整改页权限 ─────────────────────────────────────────

check('整改页：其他单位（含跨区域）只读，改不了措施也提交不了', () => {
  const task = listRectification()[0]
  for (const viewer of [跨区域, 川渝经办人]) {
    assert.equal(fillMeasures(viewer, task.id, '越权填写').ok, false)
    assert.equal(submitReview(viewer, task.id).ok, false)
    assert.equal(confirmReview(viewer, task.id).ok, false)
  }
  assert.equal(getAcceptance(3)!.整改意见, taskByCode('RECT-2026-001')!.整改意见)
})

check('整改页：责任单位可填措施、提交复核，但不能改整改意见、不能自己复核', () => {
  const task = taskByCode('RECT-2026-001')!
  assert.equal(fillMeasures(承建方, task.id, '清淤并修补裂缝段').ok, true)
  assert.equal(submitReview(承建方, task.id).ok, true)
  // 责任单位不能自核
  assert.equal(confirmReview(承建方, task.id).ok, false)
  const saved = taskByCode('RECT-2026-001')!
  assert.equal(saved.status, '已整改')
  // 整改意见始终是结论快照，措施填报没有动它
  assert.equal(saved.整改意见, '截排水沟局部淤积开裂，须清淤修补并留存影像')
})

check('整改页：只有验收组组长能确认复核，复核后闭环', () => {
  const task = taskByCode('RECT-2026-001')!
  fillMeasures(承建方, task.id, '清淤并修补')
  submitReview(承建方, task.id)
  assert.equal(confirmReview(跨区域, task.id).ok, false)
  assert.equal(confirmReview(组长, task.id).ok, true)
  assert.equal(taskByCode('RECT-2026-001')!.status, '已复核')
  assert.equal(taskByCode('RECT-2026-001')!.复核人.startsWith('王立群'), true)
})

check('责任单位只能操作派发给自己的事项，动不了别家单位的任务', () => {
  // RECT-2026-002 属于川渝地质工程公司，宏基不能动
  const other = taskByCode('RECT-2026-002')!
  assert.equal(fillMeasures(承建方, other.id, '越权').ok, false)
  assert.equal(fillMeasures(川渝经办人, other.id, '自家任务措施').ok, true)
})

// ── 事务：报告与整改台账写入失败时全部回退 ──────────────────────────────────

check('台账写入失败时报告一并回退：结论、状态、任务编号都不落库', () => {
  const before = getAcceptance(2)!
  const rectCount = listRectification().length
  const failOnRect = (key: string, _rows: EntryRow[]) => {
    if (key === 'rectification') {
      throw new Error('模拟整改台账写入失败')
    }
  }
  assert.throws(() => {
    finalizeAcceptance(组长, 2, {
      verdict: '要求整改',
      opinion: '应一起回退的意见',
      expectedVersion: 2,
      persister: failOnRect,
    })
  }, /模拟整改台账写入失败/)

  const after = getAcceptance(2)!
  assert.equal(after.status, before.status)
  assert.equal(after.验收结论, before.验收结论)
  assert.equal(after.整改任务编号, '')
  assert.equal(after.版本, before.版本)
  assert.equal(listRectification().length, rectCount)
})

// ── 历史报告按当时单位解释 ──────────────────────────────────────────────────

check('历史报告归属北山乡自然资源所：现单位组长只读，当时单位组长仍是本组', () => {
  const historical = getAcceptance(5) as AcceptanceRow
  const forCurrentLeader = acceptancePermissions(组长, historical)
  const forHistoricalLeader = acceptancePermissions(历史组长, historical)
  assert.equal(forCurrentLeader.readonly, true)
  assert.equal(forCurrentLeader.canFinalize, false)
  assert.equal(forHistoricalLeader.inGroup, true)
  // 已驳回的结论不可重复确认
  assert.equal(forHistoricalLeader.canFinalize, false)
  assert.equal(
    finalizeAcceptance(历史组长, 5, { verdict: '通过', expectedVersion: 2 }).code,
    'FORBIDDEN',
  )
})

check('历史报告当时单位的普通组员仍可只读查看，外单位不能借历史报告补会签', () => {
  const historical = getAcceptance(5)!
  const 历史所组员: Viewer = { name: '何文彬', unit: '北山乡自然资源所', region: '本县', role: '组员' }
  const perms = acceptancePermissions(历史所组员, historical)
  assert.equal(perms.readonly, false)
  assert.equal(perms.canCountersign, false) // 已驳回，通道关闭
  assert.equal(countersign(承建方, 5, '通过', '补签').code, 'FORBIDDEN')
})

// ── 归属字段随报告走，不随登录人漂移 ────────────────────────────────────────

check('列表口径：只读/本组判定完全来自报告归属快照', () => {
  const reports = listAcceptance()
  const readOnlyForContractor = reports.every((row) => acceptancePermissions(承建方, row).readonly)
  assert.equal(readOnlyForContractor, true)
  const own = reports.filter((row) => row.验收组单位 === 组长.unit)
  assert.ok(own.some((row) => !acceptancePermissions(组长, row).readonly))
  // 整改权限也回溯报告归属：外单位组长复核不了派发给承建方的任务
  const task = taskByCode('RECT-2026-001')!
  const reportsList = listAcceptance()
  const perms = rectificationPermissions(历史组长, task, reportsList)
  assert.equal(perms.canReview, false)
  assert.equal(perms.readonly, true)
})

console.log(`\n通过 ${passed} 项核查${process.exitCode ? '，存在失败项' : '，全部口径符合预期'}`)
if (process.exitCode) {
  process.exit(process.exitCode)
}
