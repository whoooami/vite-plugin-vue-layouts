import { join, parse } from 'path'
import { FileContainer, ResolvedOptions } from './types'

export function getImportCode(files: FileContainer[], options: ResolvedOptions) {
  const imports: string[] = []
  const head: string[] = []
  let id = 0

  // 处理 layout 文件的导入
  for (const __ of files) {
    for (const file of __.files) {
      const path = __.path.startsWith('/') ? `${__.path}/${file}` : `/${__.path}/${file}`
      const parsed = parse(file)
      const name = join(parsed.dir, parsed.name).replace(/\\/g, '/')
      if (options.importMode(name) === 'sync') {
        const variable = `__layout_${id}`
        head.push(`import ${variable} from '${path}'`)
        imports.push(`'${name}': ${variable},`)
        id += 1
      }
      else {
        imports.push(`'${name}': () => import('${path}'),`)
      }
    }
  }

  // 处理 pageLayout 的逻辑，将路径与自定义布局进行匹配
  const layoutMapping: string[] = []
  if (options.pageLayout && options.pageLayout.length > 0) {
    options.pageLayout.forEach(({ path, layout }) => {
      layoutMapping.push(`'${path}': '${layout}'`)
    })
  }

  // 生成最终的导入代码
  const importsCode = `
${head.join('\n')}
export const layouts = {
${imports.join('\n')}
}
`

  return importsCode
}
