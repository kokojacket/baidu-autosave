// 认证状态管理
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { apiService } from '@/services'
import { storage } from '@/utils/storage'
import { getErrorMessage } from '@/utils/helpers'

export const useAuthStore = defineStore('auth', () => {
  // 状态
  const isAuthenticated = ref(false)
  const username = ref<string>('')
  const loading = ref(false)
  const error = ref<string | null>(null)

  // 计算属性
  const isLoggedIn = computed(() => isAuthenticated.value && username.value)

  // 操作方法
  const login = async (loginUsername: string, password: string) => {
    loading.value = true
    error.value = null
    
    try {
      const response = await apiService.login(loginUsername, password)
      
      if (response.success) {
        isAuthenticated.value = true
        username.value = loginUsername
        
        // 保存认证状态到本地存储
        storage.setItem('auth', {
          isAuthenticated: true,
          username: loginUsername
        })
        
        return true
      } else {
        throw new Error(response.message || '登录失败')
      }
    } catch (err) {
      error.value = getErrorMessage(err)
      throw err
    } finally {
      loading.value = false
    }
  }

  const logout = async () => {
    try {
      // 调用后端登出接口
      await apiService.logout()
    } catch (err) {
      console.warn('登出接口调用失败:', err)
    } finally {
      // 无论接口是否成功，都清除本地状态
      isAuthenticated.value = false
      username.value = ''
      
      // 清除本地存储
      storage.removeItem('auth')
    }
  }

  const checkAuth = async () => {
    try {
      const response = await apiService.checkAuth()
      
      if (response.success) {
        isAuthenticated.value = true
        if (response.username || response.data?.username) {
          username.value = response.username || response.data.username
        }
        return true
      } else {
        isAuthenticated.value = false
        username.value = ''
        storage.removeItem('auth')
        return false
      }
    } catch (err) {
      console.error('检查认证状态失败:', err)
      isAuthenticated.value = false
      username.value = ''
      storage.removeItem('auth')
      return false
    }
  }

  const updatePassword = async (currentPassword: string, newPassword: string) => {
    try {
      const response = await apiService.updateAuth({
        username: username.value,
        password: newPassword,
        old_password: currentPassword
      })
      
      if (response.success) {
        return true
      } else {
        throw new Error(response.message || '更新密码失败')
      }
    } catch (err) {
      error.value = getErrorMessage(err)
      throw err
    }
  }

  // 初始化认证状态
  const initAuth = async () => {
    // 先检查本地存储
    const storedAuth = storage.getItem<{ isAuthenticated: boolean, username: string }>('auth')
    
    if (storedAuth?.isAuthenticated && storedAuth.username) {
      // 验证服务端认证状态
      const isValid = await checkAuth()
      
      if (isValid) {
        isAuthenticated.value = true
        username.value = storedAuth.username
      }
    }
  }

  const clearError = () => {
    error.value = null
  }

  return {
    // 状态
    isAuthenticated,
    username,
    loading,
    error,
    
    // 计算属性
    isLoggedIn,
    
    // 操作方法
    login,
    logout,
    checkAuth,
    updatePassword,
    initAuth,
    clearError
  }
})
