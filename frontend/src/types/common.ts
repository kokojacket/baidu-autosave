// 通用类型定义

// 页面状态
export type LoadingState = 'idle' | 'loading' | 'success' | 'error'

// 通知类型
export type NotificationType = 'success' | 'warning' | 'error' | 'info'

// 分页参数
export interface PaginationParams {
  page: number
  pageSize: number
  total?: number
}

// 搜索筛选参数
export interface FilterParams {
  search?: string
  status?: string
  category?: string
  dateRange?: [string, string]
}

// 排序参数
export interface SortParams {
  field: string
  order: 'asc' | 'desc'
}

// 表单验证规则
export interface ValidationRule {
  required?: boolean
  message: string
  validator?: (rule: any, value: any, callback: Function) => void
}

// 菜单项
export interface MenuItem {
  id: string
  title: string
  icon?: string
  path?: string
  children?: MenuItem[]
  disabled?: boolean
  hidden?: boolean
}

// 面包屑项
export interface BreadcrumbItem {
  title: string
  path?: string
}

// 操作按钮
export interface ActionButton {
  label: string
  type?: 'primary' | 'success' | 'warning' | 'danger' | 'info'
  icon?: string
  disabled?: boolean
  loading?: boolean
  handler: () => void | Promise<void>
}

// 表格列定义
export interface TableColumn {
  prop: string
  label: string
  width?: string | number
  minWidth?: string | number
  fixed?: 'left' | 'right'
  sortable?: boolean
  formatter?: (row: any, column: any, cellValue: any) => string
  render?: (row: any) => any
}

// 设备类型
export type DeviceType = 'mobile' | 'tablet' | 'desktop'

// 主题类型
export type ThemeType = 'light' | 'dark' | 'auto'
