import Debug from 'debug';
import fg from 'fast-glob';
import fs from 'fs';
import { join, relative, resolve } from 'path';
import { transformWithEsbuild } from 'vite';

export function extensionsToGlob(extensions: string[]) {
  return extensions.length > 1 ? `{${extensions.join(',')}}` : extensions[0] || ''
}

export function normalizePath(str: string): string {
  return str.replace(/\\/g, '/')
}

export const debug = Debug('vite-plugin-layouts')

export function pathToName(filepath: string) {
  return filepath.replace(/[_.\-\\/]/g, '_').replace(/[[:\]()]/g, '$')
}

export function resolveDirs(dirs: string | string[] | null, root: string) {
  if (dirs === null) return []
  const dirsArray = Array.isArray(dirs) ? dirs : [dirs]
  const dirsResolved: string[] = []

  for (const dir of dirsArray) {
    if (dir.includes('**')) {
      const matches = fg.sync(dir, { onlyDirectories: true })
      for (const match of matches)
        dirsResolved.push(normalizePath(resolve(root, match)))
    }
    else {
      dirsResolved.push(normalizePath(resolve(root, dir)))
    }
  }

  return dirsResolved

}

/**
 * 使用 Vite 内置的 transformWithEsbuild 提取布局属性
 */
 export async function getLayoutFromJsx(filePath: string): Promise<string | undefined> {
  try {
    const code = fs.readFileSync(filePath, 'utf-8')
    
    // 调用 Vite 原生工具，将 JSX/TSX 转译为标准 JS
    const result = await transformWithEsbuild(code, filePath, {
      loader: filePath.endsWith('tsx') ? 'tsx' : 'jsx',
    })

    // 匹配规范化后的代码中的 layout 属性
    const layoutMatch = result.code.match(/layout\s*:\s*["'`]([\w-]+)["'`]/)
    return layoutMatch ? layoutMatch[1] : undefined
  } catch {
    return undefined
  }
}

/**
 * 递归扫描并解析
 */
export async function scanJsxPages(dir: string, root: string) {
  const results: { path: string; layout: string }[] = []
  if (!fs.existsSync(dir)) return results

  const files = fs.readdirSync(dir)
  for (const file of files) {
    const fullPath = join(dir, file)
    const stat = fs.statSync(fullPath)

    if (stat.isDirectory()) {
      const subResults = await scanJsxPages(fullPath, root)
      results.push(...subResults)
    } else if (/\.(j|t)sx$/.test(file)) {
      const layout = await getLayoutFromJsx(fullPath)
      if (layout) {
        const relativePath = normalizePath(relative(root, fullPath))
        // 这里的路径需要以 / 开头以匹配路由 key
        results.push({ path: `/${relativePath}`, layout })
      }
    }
  }
  return results
}