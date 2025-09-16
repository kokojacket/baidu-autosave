// 轮询服务
import { apiService } from './api'
import type { Task, LogEntry } from '@/types'

// 浏览器兼容的 EventEmitter 实现
class EventEmitter {
  private events: { [key: string]: Function[] } = {}
  
  on(event: string, listener: Function) {
    if (!this.events[event]) {
      this.events[event] = []
    }
    this.events[event].push(listener)
  }
  
  emit(event: string, ...args: any[]) {
    if (!this.events[event]) return false
    this.events[event].forEach(listener => listener(...args))
    return true
  }
  
  off(event: string, listener?: Function) {
    if (!this.events[event]) return
    
    if (listener) {
      const index = this.events[event].indexOf(listener)
      if (index !== -1) {
        this.events[event].splice(index, 1)
      }
    } else {
      delete this.events[event]
    }
  }
  
  removeAllListeners(event?: string) {
    if (event) {
      delete this.events[event]
    } else {
      this.events = {}
    }
  }
}

export class PollingService extends EventEmitter {
  private taskStatusTimer: number | null = null
  private logsTimer: number | null = null
  private isRunning = false
  private retryCount = 0
  private maxRetries = 3
  
  // 轮询配置
  private config = {
    taskStatusInterval: 5000,   // 任务状态轮询间隔
    logsInterval: 10000,        // 日志轮询间隔
    fastPollingInterval: 1000,  // 快速轮询间隔（任务执行时）
    retryDelay: 3000           // 重试延迟
  }

  constructor() {
    super()
  }

  start() {
    if (this.isRunning) return
    
    this.isRunning = true
    console.log('启动轮询服务')
    
    // 立即执行一次轮询
    this.pollTaskStatus()
    this.pollLogs()
    
    // 启动定时轮询
    this.taskStatusTimer = window.setInterval(() => {
      this.pollTaskStatus()
    }, this.config.taskStatusInterval)
    
    this.logsTimer = window.setInterval(() => {
      this.pollLogs()
    }, this.config.logsInterval)
    
    this.emit('started')
  }

  stop() {
    if (!this.isRunning) return
    
    this.isRunning = false
    console.log('停止轮询服务')
    
    if (this.taskStatusTimer) {
      clearInterval(this.taskStatusTimer)
      this.taskStatusTimer = null
    }
    
    if (this.logsTimer) {
      clearInterval(this.logsTimer)
      this.logsTimer = null
    }
    
    this.emit('stopped')
  }

  // 设置快速轮询（任务执行时使用）
  setFastPolling(enabled: boolean) {
    if (this.taskStatusTimer) {
      clearInterval(this.taskStatusTimer)
    }
    
    const interval = enabled 
      ? this.config.fastPollingInterval 
      : this.config.taskStatusInterval
      
    this.taskStatusTimer = window.setInterval(() => {
      this.pollTaskStatus()
    }, interval)
    
    console.log(`轮询频率已调整为: ${interval}ms`)
  }

  private async pollTaskStatus() {
    try {
      const response = await apiService.getTasksStatus()
      if (response.success) {
        this.emit('task_update', response.tasks || response.data?.tasks || [])
        this.retryCount = 0
      } else {
        this.handleError('任务状态轮询失败', response.message)
      }
    } catch (error) {
      this.handleError('任务状态轮询出错', error)
    }
  }

  private async pollLogs() {
    try {
      const response = await apiService.getLogs(10)
      if (response.success) {
        this.emit('logs_update', response.logs || response.data?.logs || [])
        this.retryCount = 0
      } else {
        this.handleError('日志轮询失败', response.message)
      }
    } catch (error) {
      this.handleError('日志轮询出错', error)
    }
  }

  private handleError(context: string, error: any) {
    console.error(`${context}:`, error)
    this.retryCount++
    
    if (this.retryCount >= this.maxRetries) {
      console.log('轮询错误次数过多，暂停轮询')
      this.stop()
      
      // 延迟后重新启动
      setTimeout(() => {
        this.retryCount = 0
        this.start()
      }, this.config.retryDelay)
    }
    
    this.emit('error', { context, error })
  }

  // 获取轮询状态
  isPolling(): boolean {
    return this.isRunning
  }

  // 更新轮询配置
  updateConfig(newConfig: Partial<typeof this.config>) {
    this.config = { ...this.config, ...newConfig }
    
    // 如果轮询正在运行，重启以应用新配置
    if (this.isRunning) {
      this.stop()
      setTimeout(() => this.start(), 100)
    }
  }
}

// 单例模式导出
export const pollingService = new PollingService()
