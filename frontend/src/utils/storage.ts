// 本地存储工具
export interface StorageOptions {
  prefix?: string
  expiry?: number // 过期时间（毫秒）
}

export class Storage {
  private prefix: string
  private defaultExpiry: number

  constructor(options: StorageOptions = {}) {
    this.prefix = options.prefix || 'baidu-autosave-'
    this.defaultExpiry = options.expiry || 24 * 60 * 60 * 1000 // 24小时
  }

  private getKey(key: string): string {
    return `${this.prefix}${key}`
  }

  // 设置存储项
  setItem<T>(key: string, value: T, expiry?: number): void {
    const storageKey = this.getKey(key)
    const now = Date.now()
    const item = {
      data: value,
      timestamp: now,
      expiry: now + (expiry || this.defaultExpiry)
    }

    try {
      localStorage.setItem(storageKey, JSON.stringify(item))
    } catch (error) {
      console.warn('localStorage存储失败:', error)
    }
  }

  // 获取存储项
  getItem<T>(key: string): T | null {
    const storageKey = this.getKey(key)
    
    try {
      const stored = localStorage.getItem(storageKey)
      if (!stored) return null

      const item = JSON.parse(stored)
      const now = Date.now()

      // 检查是否过期
      if (item.expiry && now > item.expiry) {
        this.removeItem(key)
        return null
      }

      return item.data as T
    } catch (error) {
      console.warn('localStorage读取失败:', error)
      this.removeItem(key)
      return null
    }
  }

  // 删除存储项
  removeItem(key: string): void {
    const storageKey = this.getKey(key)
    try {
      localStorage.removeItem(storageKey)
    } catch (error) {
      console.warn('localStorage删除失败:', error)
    }
  }

  // 清空所有带前缀的存储项
  clear(): void {
    try {
      const keys = Object.keys(localStorage)
      keys.forEach(key => {
        if (key.startsWith(this.prefix)) {
          localStorage.removeItem(key)
        }
      })
    } catch (error) {
      console.warn('localStorage清空失败:', error)
    }
  }

  // 获取所有带前缀的键
  getAllKeys(): string[] {
    try {
      const keys = Object.keys(localStorage)
      return keys
        .filter(key => key.startsWith(this.prefix))
        .map(key => key.replace(this.prefix, ''))
    } catch (error) {
      console.warn('获取localStorage键列表失败:', error)
      return []
    }
  }

  // 检查是否存在
  hasItem(key: string): boolean {
    return this.getItem(key) !== null
  }
}

// 兼容现有存储方式的工具函数
export const storage = {
  // 兼容现有的localStorage使用
  getItem<T>(key: string): T | null {
    const value = localStorage.getItem(key)
    if (!value) return null
    
    try {
      return JSON.parse(value) as T
    } catch {
      return value as T // 兼容纯字符串存储
    }
  },
  
  setItem<T>(key: string, value: T): void {
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value)
    localStorage.setItem(key, stringValue)
  },

  removeItem(key: string): void {
    localStorage.removeItem(key)
  },

  clear(): void {
    localStorage.clear()
  }
}

// 默认实例
export const appStorage = new Storage({
  prefix: 'baidu-autosave-v2-',
  expiry: 7 * 24 * 60 * 60 * 1000 // 7天
})
