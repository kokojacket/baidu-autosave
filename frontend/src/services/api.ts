// API 服务层
import { httpClient } from './http'
import type { 
  Task, User, Config,
  CreateTaskRequest, UpdateTaskRequest,
  CreateUserRequest, UpdateUserRequest,
  ApiResponse
} from '@/types'

export class ApiService {
  // 任务相关API
  async getTasks(): Promise<ApiResponse<{ tasks: Task[] }>> {
    return httpClient.get('/api/tasks')
  }

  async createTask(data: CreateTaskRequest): Promise<ApiResponse<Task>> {
    return httpClient.post('/api/task/add', data)
  }

  async updateTask(taskId: number, data: UpdateTaskRequest): Promise<ApiResponse<Task>> {
    return httpClient.post('/api/task/update', { task_id: taskId, ...data })
  }

  async deleteTask(taskId: number): Promise<ApiResponse<void>> {
    return httpClient.post('/api/task/delete', { task_id: taskId })
  }

  async executeTask(taskId: number): Promise<ApiResponse<any>> {
    return httpClient.post('/api/task/execute', { task_id: taskId })
  }

  async executeBatchTasks(taskIds: number[]): Promise<ApiResponse<any>> {
    return httpClient.post('/api/tasks/execute-all', { task_ids: taskIds })
  }

  async deleteBatchTasks(taskIds: number[]): Promise<ApiResponse<void>> {
    return httpClient.post('/api/tasks/batch-delete', { task_ids: taskIds })
  }

  async shareTask(taskId: number, options?: { password?: string, period?: number }): Promise<ApiResponse<any>> {
    return httpClient.post('/api/task/share', { task_id: taskId, ...options })
  }

  async getShareInfo(url: string, pwd?: string): Promise<ApiResponse<any>> {
    return httpClient.post('/api/share/info', { url, pwd })
  }

  // 移除parseShareUrl，使用现有的getShareInfo接口获取文件名

  async moveTask(taskId: number, newIndex: number): Promise<ApiResponse<void>> {
    return httpClient.post('/api/task/move', { task_id: taskId, new_index: newIndex })
  }

  // 用户相关API
  async getUsers(): Promise<ApiResponse<{ users: User[], current_user: string }>> {
    return httpClient.get('/api/users')
  }

  async createUser(data: CreateUserRequest): Promise<ApiResponse<User>> {
    return httpClient.post('/api/user/add', data)
  }

  async updateUser(data: UpdateUserRequest): Promise<ApiResponse<User>> {
    return httpClient.post('/api/user/update', data)
  }

  async switchUser(username: string): Promise<ApiResponse<any>> {
    return httpClient.post('/api/user/switch', { username })
  }

  async deleteUser(username: string): Promise<ApiResponse<void>> {
    return httpClient.post('/api/user/delete', { username })
  }

  async getUserQuota(): Promise<ApiResponse<any>> {
    return httpClient.get('/api/user/quota')
  }

  async getUserCookies(username: string): Promise<ApiResponse<{ cookies: string }>> {
    return httpClient.get(`/api/user/${username}/cookies`)
  }

  // 配置相关API
  async getConfig(): Promise<ApiResponse<{ config: Config }>> {
    return httpClient.get('/api/config')
  }

  async updateConfig(config: any): Promise<ApiResponse<void>> {
    return httpClient.post('/api/config/update', config)
  }

  async testNotify(): Promise<ApiResponse<void>> {
    return httpClient.post('/api/notify/test')
  }

  async addNotifyField(name: string, value: string): Promise<ApiResponse<void>> {
    return httpClient.post('/api/notify/fields', { name, value })
  }

  async deleteNotifyField(name: string): Promise<ApiResponse<void>> {
    return httpClient.delete('/api/notify/fields', { name })
  }

  async updateAuth(data: { username: string, password: string, old_password: string }): Promise<ApiResponse<void>> {
    return httpClient.post('/api/auth/update', data)
  }

  // 其他API
  async checkVersion(source?: string): Promise<ApiResponse<any>> {
    return httpClient.get('/api/version/check', { source })
  }

  async getLogs(limit?: number): Promise<ApiResponse<any>> {
    return httpClient.get('/api/logs', { limit })
  }

  async getTasksStatus(): Promise<ApiResponse<{ tasks: Task[] }>> {
    return httpClient.get('/api/tasks/status')
  }

  // 认证相关API
  async login(username: string, password: string): Promise<ApiResponse<any>> {
    return httpClient.post('/api/auth/login', { username, password })
  }

  async logout(): Promise<ApiResponse<any>> {
    return httpClient.post('/api/auth/logout')
  }

  async checkAuth(): Promise<ApiResponse<any>> {
    return httpClient.get('/api/auth/check')
  }
}

// 单例模式导出
export const apiService = new ApiService()
