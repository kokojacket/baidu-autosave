// 状态管理统一导出
import { createPinia } from 'pinia'

// 创建 Pinia 实例
export const pinia = createPinia()

// 导出所有 store
export { useAuthStore } from './auth'
export { useTaskStore } from './tasks'
export { useUserStore } from './users'
export { useConfigStore } from './config'
export { useVersionStore } from './version'

// 默认导出 pinia 实例
export default pinia
