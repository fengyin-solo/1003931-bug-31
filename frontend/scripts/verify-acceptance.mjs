/**
 * 验收链路核查脚本：直接跑数据域，验证本次整改的六条硬口径。
 * 用 esbuild 把 TS + @ 别名打包到临时文件后用 Node 执行（纯前端项目没有后端测试环境）。
 * 运行：npm run verify
 */
import { build } from 'esbuild'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const root = process.cwd()
const entry = path.join(root, 'scripts/verify-acceptance.impl.ts')
const outfile = path.join(root, 'node_modules/.cache/verify-acceptance.mjs')

await build({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile,
  alias: { '@': path.join(root, 'src') },
  logLevel: 'silent',
})

await import(pathToFileURL(outfile).href)
