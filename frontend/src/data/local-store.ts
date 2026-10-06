import { SEED_ROWS } from './seed'
import type { EntryRow } from './types'

// 本地持久化：数据放在 localStorage 里，刷新、关掉再打开都还在。
// v2：验收/整改改为结构化归属字段，旧键里的演示数据不再兼容。
const STORAGE_KEY = 'geohazard-monitor-prevention:entries:v2'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function readStorage(): Record<string, EntryRow[]> {
  const fallback = clone(SEED_ROWS)
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, EntryRow[]>
    return { ...fallback, ...parsed }
  } catch {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
}

let cache: Record<string, EntryRow[]> | null = null

export function allRows(): Record<string, EntryRow[]> {
  if (cache === null) {
    cache = readStorage()
  }
  return cache
}

export function listRows(key: string): EntryRow[] {
  return allRows()[key] ?? []
}

export function saveRows(key: string, rows: EntryRow[]): void {
  const next = { ...allRows(), [key]: rows }
  cache = next
  persist(next)
}

export function resetRows(key: string): EntryRow[] {
  const rows = clone(SEED_ROWS[key] ?? [])
  saveRows(key, rows)
  return rows
}

/**
 * 多表事务提交：报告与整改台账必须同成同败。
 * 生产环境一次 localStorage 写入提交整份快照（原子）；
 * 注入 persister 时（验收脚本模拟报告写成功、台账写失败）逐表提交，
 * 中途失败按旧快照逐表补偿回退，保证两边不会只成一边。
 */
export type CommitStep = { key: string; rows: EntryRow[] }

export function commit(steps: CommitStep[], persister?: (key: string, rows: EntryRow[]) => void): void {
  const before = allRows()
  const snapshot = clone(before)
  try {
    if (persister) {
      for (const step of steps) {
        persister(step.key, step.rows)
      }
    } else {
      const next = { ...before }
      for (const step of steps) {
        next[step.key] = step.rows
      }
      persist(next)
    }
    const next = { ...allRows() }
    for (const step of steps) {
      next[step.key] = step.rows
    }
    cache = next
  } catch (error) {
    cache = snapshot
    if (persister) {
      // 补偿：把可能已经写进去的表逐张还原到事务前快照
      for (const step of steps) {
        try {
          persister(step.key, snapshot[step.key] ?? [])
        } catch {
          // 补偿本身失败不再抛出，cache 已回退，重新加载即从持久层恢复
        }
      }
    }
    throw error
  }
}

export function resetAllRows(): Record<string, EntryRow[]> {
  const fallback = clone(SEED_ROWS)
  cache = fallback
  persist(fallback)
  return fallback
}

function persist(data: Record<string, EntryRow[]>): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  }
}

export function storageKey(): string {
  return STORAGE_KEY
}
