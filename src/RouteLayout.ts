import type { ResolvedOptions } from './types'

function getClientCode(importCode: string, options: ResolvedOptions) {
  const code = `
${importCode}
export const createGetRoutes = (router, withLayout = false) => {
  const routes = router.getRoutes()
  if (withLayout) {
    return routes
  }
  return () => routes.filter(route => !route.meta.isLayout)
}

function findPageLayout(path, pageLayout) {
  return pageLayout.find(({ path: p }) => p.endsWith('/') && p.length>1 ? path.startsWith(p.slice(0, -1)) : path === p)?.layout;
}

export function setupLayouts(routes) {
  function deepSetupLayout(routes, top = true) {
    return routes.map(route => {
      // console.log("route.children", route.children);
      if (route.children?.length > 0) {
        route.children = deepSetupLayout(route.children, false)
      }
      
      const matchedLayout = findPageLayout(route.name, ${JSON.stringify(options.pageLayout)})
      console.log("route.path, route.name, matchedLayout: ", route.path, route.name, matchedLayout, route.meta?.layout);

      if (top) {
        const skipLayout = !route.component && route.children?.find(r => (r.path === '' || r.path === '/') && r.meta?.isLayout)  

        if (skipLayout) {
          return route
        }

        if (route.meta?.layout !== false) {
          return { 
            path: route.path,
            component: layouts[matchedLayout || route.meta?.layout || '${options.defaultLayout}'],
            children: route.path === '/' ? [route] : [{...route, path: ''}],
            meta: {
              isLayout: true
            }
          }
        }
      }

      if (!!matchedLayout || route.meta?.layout) {
        return { 
          path: route.path,
          component: layouts[matchedLayout || route.meta?.layout],
          children: [ {...route, path: ''} ],
          meta: {
            isLayout: true
          }
        }
      }

      return route
    })
  }

    return deepSetupLayout(routes)

}
`
  return code
}

export default getClientCode
