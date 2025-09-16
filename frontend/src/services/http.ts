// HTTP 客户端封装
import type { ApiResponse } from '@/types'

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  headers?: Record<string, string>
  params?: Record<string, any>
  timeout?: number
}

export class HttpClient {
  private baseURL = ''
  private defaultTimeout = 30000

  constructor(baseURL?: string) {
    if (baseURL) {
      this.baseURL = baseURL
    }
  }

  private buildURL(endpoint: string, params?: Record<string, any>): string {
    // 使用baseURL，如果没有设置则使用当前域名
    const baseUrl = this.baseURL || window.location.origin
    const url = new URL(endpoint, baseUrl)
    
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value))
        }
      })
    }
    
    return url.toString()
  }

  private async request<T = any>(
    endpoint: string, 
    options: RequestOptions = {}
  ): Promise<ApiResponse<T>> {
    const {
      method = 'GET',
      headers = {},
      params,
      timeout = this.defaultTimeout
    } = options

    const url = this.buildURL(endpoint, method === 'GET' ? params : undefined)
    
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      const requestInit: RequestInit = {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        credentials: 'include', // 包含cookies，支持session认证
        signal: controller.signal
      }

      // POST请求的参数放在body中
      if (method !== 'GET' && params) {
        requestInit.body = JSON.stringify(params)
      }

      const response = await fetch(url, requestInit)
      clearTimeout(timeoutId)

      // 检查HTTP状态码
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const contentType = response.headers.get('content-type')
      
      // 处理JSON响应
      if (contentType?.includes('application/json')) {
        const data = await response.json()
        return data as ApiResponse<T>
      }
      
      // 如果收到HTML响应，说明可能是登录页面，抛出错误
      if (contentType?.includes('text/html')) {
        throw new Error('收到HTML响应，可能需要重新登录')
      }
      
      // 处理其他文本响应
      const text = await response.text()
      return {
        success: true,
        data: text as T
      }

    } catch (error) {
      clearTimeout(timeoutId)
      
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error('请求超时')
        }
        throw error
      }
      
      throw new Error('网络请求失败')
    }
  }

  async get<T = any>(endpoint: string, params?: Record<string, any>): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'GET', params })
  }

  async post<T = any>(endpoint: string, data?: Record<string, any>): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'POST', params: data })
  }

  async put<T = any>(endpoint: string, data?: Record<string, any>): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'PUT', params: data })
  }

  async delete<T = any>(endpoint: string, data?: Record<string, any>): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'DELETE', params: data })
  }
}

// 单例导出
export const httpClient = new HttpClient()
