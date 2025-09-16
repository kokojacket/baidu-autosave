// 路由配置
import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { ROUTES, PAGE_TITLES } from '@/utils/constants'

// 路由懒加载
const LoginView = () => import('@/views/login/LoginView.vue')
const DashboardView = () => import('@/views/dashboard/DashboardView.vue')
const TasksView = () => import('@/views/tasks/TasksView.vue')
const UsersView = () => import('@/views/users/UsersView.vue')
const SettingsView = () => import('@/views/settings/SettingsView.vue')

const routes = [
  {
    path: '/',
    redirect: '/dashboard'
  },
  {
    path: '/login',
    name: 'Login',
    component: LoginView,
    meta: {
      title: PAGE_TITLES.LOGIN,
      requiresAuth: false,
      hideInMenu: true
    }
  },
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: DashboardView,
    meta: {
      title: PAGE_TITLES.DASHBOARD,
      requiresAuth: true,
      icon: 'Dashboard'
    }
  },
  {
    path: '/tasks',
    name: 'Tasks',
    component: TasksView,
    meta: {
      title: PAGE_TITLES.TASKS,
      requiresAuth: true,
      icon: 'List'
    }
  },
  {
    path: '/users',
    name: 'Users',
    component: UsersView,
    meta: {
      title: PAGE_TITLES.USERS,
      requiresAuth: true,
      icon: 'User'
    }
  },
  {
    path: '/settings',
    name: 'Settings',
    component: SettingsView,
    meta: {
      title: PAGE_TITLES.SETTINGS,
      requiresAuth: true,
      icon: 'Setting'
    }
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/dashboard'
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// 路由守卫
router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore()
  
  // 设置页面标题
  if (to.meta.title) {
    document.title = `${to.meta.title} - 百度网盘自动转存`
  }
  
  // 检查路由是否需要认证
  if (to.meta.requiresAuth) {
    // 如果未登录，重定向到登录页
    if (!authStore.isLoggedIn) {
      // 尝试从本地恢复认证状态
      await authStore.initAuth()
      
      // 再次检查
      if (!authStore.isLoggedIn) {
        next({
          path: '/login',
          query: { redirect: to.fullPath }
        })
        return
      }
    }
  }
  
  // 如果已登录用户访问登录页，重定向到首页
  if (to.path === '/login' && authStore.isLoggedIn) {
    next('/')
    return
  }
  
  next()
})

// 路由后置守卫
router.afterEach((to, from) => {
  // 可以在这里添加页面访问统计等逻辑
  console.log(`导航到: ${to.path}`)
})

export default router

// 导出路由相关的工具函数
export const getMenuRoutes = () => {
  return routes.filter(route => 
    route.meta?.requiresAuth && 
    !route.meta?.hideInMenu && 
    route.name !== 'Dashboard' // 排除首页，通常不在菜单中显示
  )
}

export const getBreadcrumbs = (currentRoute: any) => {
  const breadcrumbs = []
  
  // 添加首页
  breadcrumbs.push({
    title: '首页',
    path: '/dashboard'
  })
  
  // 添加当前页面
  if (currentRoute.meta?.title && currentRoute.path !== '/dashboard') {
    breadcrumbs.push({
      title: currentRoute.meta.title,
      path: currentRoute.path
    })
  }
  
  return breadcrumbs
}
