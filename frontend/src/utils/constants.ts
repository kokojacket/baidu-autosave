// 应用常量定义

// 任务状态常量
export const TASK_STATUS = {
  NORMAL: 'normal',
  ERROR: 'error', 
  RUNNING: 'running',
  SUCCESS: 'success'
} as const

// 任务状态对应的中文文本
export const TASK_STATUS_TEXT = {
  [TASK_STATUS.NORMAL]: '正常',
  [TASK_STATUS.ERROR]: '错误',
  [TASK_STATUS.RUNNING]: '运行中',
  [TASK_STATUS.SUCCESS]: '成功'
} as const

// 任务状态对应的颜色
export const TASK_STATUS_COLOR = {
  [TASK_STATUS.NORMAL]: '#909399',
  [TASK_STATUS.ERROR]: '#F56C6C',
  [TASK_STATUS.RUNNING]: '#E6A23C',
  [TASK_STATUS.SUCCESS]: '#67C23A'
} as const

// 用户角色常量
export const USER_ROLES = {
  ADMIN: 'admin',
  USER: 'user'
} as const

// 通知类型常量
export const NOTIFICATION_TYPES = {
  SUCCESS: 'success',
  WARNING: 'warning',
  ERROR: 'error',
  INFO: 'info'
} as const

// 页面路由常量
export const ROUTES = {
  LOGIN: '/login',
  DASHBOARD: '/dashboard',
  TASKS: '/tasks',
  USERS: '/users',
  SETTINGS: '/settings',
  LOGS: '/logs'
} as const

// 页面标题常量
export const PAGE_TITLES = {
  LOGIN: '登录',
  DASHBOARD: '仪表盘',
  TASKS: '任务管理',
  USERS: '用户管理', 
  SETTINGS: '系统设置',
  LOGS: '日志查看'
} as const

// 分页常量
export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 20,
  PAGE_SIZE_OPTIONS: [10, 20, 50, 100]
} as const

// 轮询间隔常量（毫秒）
export const POLLING_INTERVALS = {
  TASK_STATUS: 5000,      // 任务状态轮询
  LOGS: 10000,           // 日志轮询
  FAST_POLLING: 1000,    // 快速轮询（任务执行时）
  USER_QUOTA: 30000      // 用户配额轮询
} as const

// HTTP请求相关常量
export const HTTP = {
  TIMEOUT: 30000,         // 请求超时时间
  MAX_RETRIES: 3,         // 最大重试次数
  RETRY_DELAY: 1000       // 重试延迟
} as const

// 本地存储键名常量
export const STORAGE_KEYS = {
  USER_PREFERENCES: 'user-preferences',
  THEME: 'theme',
  SIDEBAR_COLLAPSED: 'sidebar-collapsed',
  TASK_FILTERS: 'task-filters',
  TABLE_SETTINGS: 'table-settings'
} as const

// 文件大小常量
export const FILE_SIZE = {
  KB: 1024,
  MB: 1024 * 1024,
  GB: 1024 * 1024 * 1024,
  TB: 1024 * 1024 * 1024 * 1024
} as const

// 时间常量（毫秒）
export const TIME = {
  SECOND: 1000,
  MINUTE: 60 * 1000,
  HOUR: 60 * 60 * 1000,
  DAY: 24 * 60 * 60 * 1000,
  WEEK: 7 * 24 * 60 * 60 * 1000
} as const

// 响应式断点常量
export const BREAKPOINTS = {
  MOBILE: 768,
  TABLET: 1024,
  DESKTOP: 1200,
  WIDE: 1920
} as const

// 主题色常量
export const THEME_COLORS = {
  PRIMARY: '#409EFF',
  SUCCESS: '#67C23A', 
  WARNING: '#E6A23C',
  DANGER: '#F56C6C',
  INFO: '#909399'
} as const

// 正则表达式常量
export const REGEX = {
  URL: /^https?:\/\/.+/,
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  BAIDU_SHARE_URL: /^https:\/\/pan\.baidu\.com\/(s\/[a-zA-Z0-9_-]+|share\/init\?surl=[a-zA-Z0-9_-]+)/,
  VERSION: /^v?\d+\.\d+\.\d+$/
} as const

// 操作类型常量
export const OPERATION_TYPES = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  EXECUTE: 'execute',
  SHARE: 'share',
  MOVE: 'move'
} as const

// 排序方向常量
export const SORT_DIRECTIONS = {
  ASC: 'asc',
  DESC: 'desc'
} as const

// 默认配置常量
export const DEFAULT_CONFIG = {
  POLLING_ENABLED: true,
  AUTO_EXECUTE: false,
  NOTIFICATION_ENABLED: true,
  THEME: 'light',
  LANGUAGE: 'zh-CN'
} as const
