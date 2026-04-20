import type { ResolvedOptions } from './types'

function getClientCode(importCode: string, options: ResolvedOptions) {
  // 序列化从 index.ts 传递过来的扫描结果
  const pageLayoutMaps = JSON.stringify(options.pageLayout || [])

  return `
${importCode}

export const createGetRoutes = (router, withLayout = false) => {
  const routes = router.getRoutes()
  if (withLayout) return routes
  return () => routes.filter(route => !route.meta.isLayout)
}

/**
 * 路径归一化匹配函数
 * 将物理路径和路由名统一转换为 "store/share/invite" 格式进行比对
 */
function findPageLayout(route, pageLayout) {
  const routeName = route.name || '';
  const componentPath = (typeof route.component === 'string') ? route.component : '';

  const normalize = (s) => {
    if (typeof s !== 'string') return '';
    return s
      .replace(/\\\\/g, '/')              // 统一斜杠
      .replace(/\\.(j|t)sx$/, '')         // 移除扩展名
      .replace(/\\/index$/, '')           // 移除 index 结尾
      .replace(/^.*\\/src\\/pages/, '')    // 截断物理路径前缀
      .replace(/^\\//, '')                // 移除开头斜杠
      .replace(/\\/$/, '');               // 移除结尾斜杠
  };

  const nName = normalize(routeName);
  const nComponent = normalize(componentPath);

  const found = pageLayout.find(({ path: p }) => {
    const nSource = normalize(p);
    return nSource !== '' && (nSource === nName || nSource === nComponent);
  });

  return found?.layout;
}

export function setupLayouts(routes) {
  const jsxLayouts = ${pageLayoutMaps}; 
  const defaultLayout = '${options.defaultLayout || 'default'}';
  // console.log('[Layouts] 插件注入的 JSX 映射表:', jsxLayouts);
  // console.log('[Layouts] 待处理的原始路由:', routes);

  /**
   * 递归处理路由表
   * @param isRoot 是否是第一层路由
   */
  function deepSetupLayout(routes, isRoot = true) {
    return routes.map(route => {
      // 1. 先递归处理子路由 (自底向上策略)
      if (route.children && route.children.length > 0) {
        route.children = deepSetupLayout(route.children, false);
      }
      
      // 2. 尝试匹配当前节点的布局
      const matchedLayoutName = findPageLayout(route, jsxLayouts);
      const manualLayoutName = route.meta?.layout;
      const layoutName = matchedLayoutName || manualLayoutName;

      // 3. 匹配成功后的包装逻辑
      if (layoutName && layouts[layoutName]) {
        // console.log('[Layouts] 精确匹配成功:', (route.name || route.path), '->', layoutName);
        return { 
          ...route,
          component: layouts[layoutName],
          // 将原始组件下移一层，path 设为空，并标记已处理
          children: [{ ...route, path: '', meta: { ...(route.meta || {}), isLayout: false } }],
          meta: { 
            ...(route.meta || {}), 
            isLayout: true, 
            layout: layoutName 
          }
        };
      }

      // 4. 默认布局补全逻辑 (仅作用于顶层且未被子级覆盖的情况)
      if (isRoot && route.meta?.layout !== false) {
        // 检查子树是否已经含有布局（递归检查 isLayout 标记）
        const hasSubLayout = (r) => {
          if (r.meta?.isLayout) return true;
          if (r.children && r.children.length > 0) {
            return r.children.some(hasSubLayout);
          }
          return false;
        };

        if (!hasSubLayout(route)) {
          const targetDefault = layouts[defaultLayout];
          if (targetDefault) {
            // console.log('[Layouts] 自动应用默认布局:', route.path);
            return {
              ...route,
              component: targetDefault,
              children: route.path === '/' ? [route] : [{ ...route, path: '' }],
              meta: { ...(route.meta || {}), isLayout: true }
            };
          }
        }
      }

      return route;
    });
  }

  const result = deepSetupLayout(routes);
  // console.log('[Layouts] 最终生成的路由表:', result);
  return result;
}
`
}

export default getClientCode