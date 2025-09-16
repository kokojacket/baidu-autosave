// 版本检查组合式函数
import { ref, onMounted } from 'vue'
import { apiService } from '@/services'
import { APP_VERSION } from '@/config/version'
import { compareVersions } from '@/utils/helpers'

export function useVersionCheck() {
  const currentVersion = ref(APP_VERSION)
  const latestVersion = ref('')
  const hasUpdate = ref(false)
  const checking = ref(false)
  const updateInfo = ref<{
    version: string
    link?: string
    notes?: string
  } | null>(null)
  
  const checkForUpdates = async () => {
    if (checking.value) return
    
    checking.value = true
    
    try {
      const sources = ['github', 'dockerhub', 'dockerhub_alt', 'msrun', '1ms']
      
      for (const source of sources) {
        try {
          const response = await apiService.checkVersion(source)
          
          if (response.success && response.version) {
            latestVersion.value = response.version
            hasUpdate.value = compareVersions(response.version, currentVersion.value) > 0
            
            if (hasUpdate.value) {
              console.log(`发现新版本: ${response.version}，当前版本: ${currentVersion.value}`)
              
              updateInfo.value = {
                version: response.version,
                link: response.link || response.data?.link,
                notes: response.release_notes || response.data?.release_notes
              }
              
              // 可以触发全局通知
              showUpdateNotification(response.version, response.link)
            }
            
            break // 成功获取版本信息后退出循环
          }
        } catch (error) {
          console.warn(`从${source}获取版本信息失败:`, error)
          continue
        }
      }
    } catch (error) {
      console.error('版本检查失败:', error)
    } finally {
      checking.value = false
    }
  }
  
  const showUpdateNotification = (version: string, link?: string) => {
    // 可以集成通知组件或使用全局状态
    // 这里可以调用 ElMessage 或其他通知组件
    console.log('新版本可用:', version, link)
    
    // TODO: 集成全局通知组件
    // ElNotification({
    //   title: '发现新版本',
    //   message: `新版本 ${version} 已发布`,
    //   type: 'info',
    //   duration: 0, // 不自动关闭
    //   onClick: () => {
    //     if (link) {
    //       window.open(link, '_blank')
    //     }
    //   }
    // })
  }
  
  // 重置状态
  const resetVersionCheck = () => {
    latestVersion.value = ''
    hasUpdate.value = false
    updateInfo.value = null
  }
  
  // 自动检查更新已移除，统一由版本store管理
  // 避免重复检查，提高性能
  
  return {
    currentVersion,
    latestVersion,
    hasUpdate,
    checking,
    updateInfo,
    checkForUpdates,
    resetVersionCheck
  }
}
