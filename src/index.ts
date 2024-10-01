import { resolve } from 'path'
import type { ModuleNode, Plugin, ResolvedConfig } from 'vite'
import { createVirtualModuleCode } from './clientSide'
import { getFilesFromPath } from './files'
import { getImportCode } from './importCode'
import getClientCode from './RouteLayout'
import { debug, normalizePath, resolveDirs } from './utils'

import type {
  clientSideOptions,
  FileContainer,
  ResolvedOptions,
  UserOptions,
} from './types'

const MODULE_IDS = ['layouts-generated', 'virtual:generated-layouts']
const MODULE_ID_VIRTUAL = '/@vite-plugin-vue-layouts/generated-layouts'

export function defaultImportMode(name: string) {
  if (process.env.VITE_SSG)
    return 'sync'

  return name === 'default' ? 'sync' : 'async'
}

function resolveOptions(userOptions: UserOptions): ResolvedOptions {
  return Object.assign(
    {
      defaultLayout: 'default',
      layoutsDirs: 'src/layouts',
      pagesDirs: 'src/pages',
      extensions: ['vue'],
      exclude: [],
      importMode: defaultImportMode,
      pageLayout: [] // 在此加入 pageLayout 选项
    },
    userOptions,
  )
}

export default function Layout(userOptions: UserOptions = {}): Plugin {

  // If the customization level is not high, enable clientLayout to support better performance 
  if (canEnableClientLayout(userOptions)) {
    return ClientSideLayout({
      defaultLayout: userOptions.defaultLayout,
      layoutDir: userOptions.layoutsDirs as string
    })
  }

  let config: ResolvedConfig
  
  const options: ResolvedOptions = resolveOptions(userOptions)

  let layoutDirs: string[]
  let pagesDirs: string[]

  return {
    name: 'vite-plugin-vue-layouts',
    enforce: 'pre',
    configResolved(_config) {
      config = _config
      layoutDirs = resolveDirs(options.layoutsDirs, config.root)
      pagesDirs = resolveDirs(options.pagesDirs, config.root)
    },
    configureServer({ moduleGraph, watcher, ws }) {
      watcher.add(options.layoutsDirs)

      const reloadModule = (module: ModuleNode | undefined, path = '*') => {
        if (module) {
          moduleGraph.invalidateModule(module)
          if (ws) {
            ws.send({
              path,
              type: 'full-reload',
            })
          }
        }
      }

      const updateVirtualModule = (path: string) => {
        path = normalizePath(path)

        if (pagesDirs.length === 0 ||
            pagesDirs.some(dir => path.startsWith(dir)) ||
            layoutDirs.some(dir => path.startsWith(dir))) {
          debug('reload', path)
          const module = moduleGraph.getModuleById(MODULE_ID_VIRTUAL)
          reloadModule(module)
        }
      }

      watcher.on('add', (path) => {
        updateVirtualModule(path)
      })

      watcher.on('unlink', (path) => {
        updateVirtualModule(path)
      })

      watcher.on('change', async(path) => {
        updateVirtualModule(path)
      })
    },
    resolveId(id) {
      return MODULE_IDS.includes(id) || MODULE_IDS.some(i => id.startsWith(i))
        ? MODULE_ID_VIRTUAL
        : null
    },
    async load(id) {
      if (id === MODULE_ID_VIRTUAL) {
        const container: FileContainer[] = []

        for (const dir of layoutDirs) {
          const layoutsDirPath = dir.startsWith('/')
            ? normalizePath(dir)
            : normalizePath(resolve(config.root, dir))

          debug('Loading Layout Dir: %O', layoutsDirPath)

          const _f = await getFilesFromPath(layoutsDirPath, options)
          container.push({ path: layoutsDirPath, files: _f })
        }

        const importCode = getImportCode(container, options)

        const clientCode = getClientCode(importCode, options)

        debug('Client code: %O', clientCode)
        return clientCode
      }
    },
  }
}

export function ClientSideLayout(options?: clientSideOptions): Plugin {
  const {
    layoutDir = 'src/layouts',
    defaultLayout = 'default',
    importMode = process.env.VITE_SSG ? 'sync' : 'async',
    // pageLayout = [],
  } = options || {}
  return {
    name: 'vite-plugin-vue-layouts',
    resolveId(id) {
      const MODULE_ID = MODULE_IDS.find((MODULE_ID) => id === MODULE_ID);
      if (MODULE_ID) {
        return `\0` + MODULE_ID;
      }
    },
    load(id) {
      if (
        MODULE_IDS.some((MODULE_ID) => id === `\0${MODULE_ID}`)
      ) {
        return createVirtualModuleCode({
          layoutDir,
          importMode,
          defaultLayout,
          // pageLayout
        });
      }
    },
  }
}

function canEnableClientLayout(options: UserOptions) {
  const keys = Object.keys(options)

  // Non-isomorphic options
  if (keys.length > 2 || keys.some(key => !['layoutsDirs', 'defaultLayout'].includes(key))) {
    return false
  }
  // arrays and glob cannot be isomorphic either
  if (options.layoutsDirs && (Array.isArray(options.layoutsDirs) || options.layoutsDirs.includes("*"))) {
    return false
  }

  return true
}

export * from './types'
