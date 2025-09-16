// 通用辅助函数

// 格式化文件大小
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// 格式化时间
export function formatTime(timestamp: string | number | Date): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  // 小于1分钟
  if (diff < 60 * 1000) {
    return '刚刚'
  }

  // 小于1小时
  if (diff < 60 * 60 * 1000) {
    const minutes = Math.floor(diff / (60 * 1000))
    return `${minutes}分钟前`
  }

  // 小于1天
  if (diff < 24 * 60 * 60 * 1000) {
    const hours = Math.floor(diff / (60 * 60 * 1000))
    return `${hours}小时前`
  }

  // 小于7天
  if (diff < 7 * 24 * 60 * 60 * 1000) {
    const days = Math.floor(diff / (24 * 60 * 60 * 1000))
    return `${days}天前`
  }

  // 超过7天显示具体日期
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// 格式化日期
export function formatDate(timestamp: string | number | Date, format = 'YYYY-MM-DD HH:mm:ss'): string {
  const date = new Date(timestamp)
  
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')

  return format
    .replace('YYYY', String(year))
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hours)
    .replace('mm', minutes)
    .replace('ss', seconds)
}

// 防抖函数
export function debounce<T extends (...args: any[]) => void>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: number
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId)
    timeoutId = window.setTimeout(() => func(...args), delay)
  }
}

// 节流函数
export function throttle<T extends (...args: any[]) => void>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let lastCall = 0
  
  return (...args: Parameters<T>) => {
    const now = Date.now()
    if (now - lastCall >= delay) {
      lastCall = now
      func(...args)
    }
  }
}

// 深度复制
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime()) as T
  }

  if (obj instanceof Array) {
    return obj.map(item => deepClone(item)) as T
  }

  if (typeof obj === 'object') {
    const cloned = {} as T
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        cloned[key] = deepClone(obj[key])
      }
    }
    return cloned
  }

  return obj
}

// 生成随机字符串
export function generateRandomString(length = 8): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

// URL参数解析
export function parseQuery(search?: string): Record<string, string> {
  const query = search || window.location.search
  const params = new URLSearchParams(query)
  const result: Record<string, string> = {}
  
  params.forEach((value, key) => {
    result[key] = value
  })
  
  return result
}

// 构建URL参数
export function buildQuery(params: Record<string, any>): string {
  const searchParams = new URLSearchParams()
  
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.append(key, String(value))
    }
  })
  
  const queryString = searchParams.toString()
  return queryString ? `?${queryString}` : ''
}

// 版本号比较
export function compareVersions(v1: string, v2: string): number {
  // 标准化版本号
  const normalizeVersion = (version: string): string => {
    if (version === 'latest') return '999.999.999'
    
    const versionMatch = version.match(/(?:Release\s+)?(v?\d+\.\d+\.\d+)/i)
    let cleanVersion = version
    
    if (versionMatch) {
      cleanVersion = versionMatch[1]
    }
    
    return cleanVersion.replace(/^v/i, '')
  }

  const norm1 = normalizeVersion(v1)
  const norm2 = normalizeVersion(v2)
  
  const parts1 = norm1.split('.').map(Number)
  const parts2 = norm2.split('.').map(Number)
  
  for (let i = 0; i < 3; i++) {
    const diff = (parts1[i] || 0) - (parts2[i] || 0)
    if (diff !== 0) return diff
  }
  
  return 0
}

// 错误处理辅助函数
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  
  if (typeof error === 'string') {
    return error
  }
  
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as any).message)
  }
  
  return '未知错误'
}

// 任务状态相关辅助函数
export function getTaskStatusText(status: string): string {
  const statusMap: Record<string, string> = {
    normal: '正常',
    error: '错误',
    running: '运行中',
    success: '成功'
  }
  return statusMap[status] || status
}

export function getTaskStatusColor(status: string): string {
  const colorMap: Record<string, string> = {
    normal: '#909399',
    error: '#F56C6C',
    running: '#E6A23C',
    success: '#67C23A'
  }
  return colorMap[status] || '#909399'
}

// 设备检测 - 统一断点与CSS保持一致
export function isMobile(): boolean {
  return window.innerWidth < 1200
}

export function isTablet(): boolean {
  return window.innerWidth >= 768 && window.innerWidth < 1200
}

export function isDesktop(): boolean {
  return window.innerWidth >= 1200
}
