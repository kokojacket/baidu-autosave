<template>
  <div class="settings-view">
    <div class="page-header">
      <h1 class="page-title">系统设置</h1>
    </div>

    <div class="settings-content">
      <el-tabs v-model="activeTab" class="settings-tabs">
        <!-- 通知设置 -->
        <el-tab-pane label="通知设置" name="notification">
          <el-card>
            <div class="setting-section">
              <h3>通知配置</h3>
              <el-form :model="notificationForm" label-width="150px">
                <el-form-item label="启用通知">
                  <el-switch v-model="notificationForm.enabled" />
                </el-form-item>
                
                <template v-if="notificationForm.enabled">
                  <el-form-item label="通知延迟(秒)">
                    <el-input-number 
                      v-model="notificationForm.notification_delay" 
                      :min="0" 
                      :max="300" 
                    />
                  </el-form-item>
                  
                  <el-divider content-position="left">Push Plus配置</el-divider>
                  
                  <el-form-item label="Push Plus Token">
                    <el-input
                      v-model="notificationForm.push_plus_token"
                      placeholder="请输入Push Plus Token"
                      show-password
                    />
                  </el-form-item>
                  
                  <el-form-item label="Push Plus User">
                    <el-input
                      v-model="notificationForm.push_plus_user"
                      placeholder="请输入Push Plus用户标识"
                    />
                  </el-form-item>
                  
                  <el-divider content-position="left">Webhook配置</el-divider>
                  
                  <el-form-item label="Webhook URL">
                    <el-input
                      v-model="notificationForm.webhook_url"
                      placeholder="https://your-webhook-url.com"
                    />
                  </el-form-item>
                  
                  <el-form-item label="HTTP方法">
                    <el-select v-model="notificationForm.webhook_method" style="width: 120px">
                      <el-option label="POST" value="POST" />
                      <el-option label="PUT" value="PUT" />
                      <el-option label="PATCH" value="PATCH" />
                    </el-select>
                  </el-form-item>
                  
                  <el-form-item label="内容类型">
                    <el-select v-model="notificationForm.webhook_content_type">
                      <el-option label="application/json" value="application/json" />
                      <el-option label="application/x-www-form-urlencoded" value="application/x-www-form-urlencoded" />
                      <el-option label="text/plain" value="text/plain" />
                    </el-select>
                  </el-form-item>
                  
                  <el-form-item label="请求头">
                    <el-input
                      v-model="notificationForm.webhook_headers"
                      type="textarea"
                      :rows="2"
                      placeholder="Content-Type: application/json"
                    />
                    <div class="form-tip">每行一个头部，格式: Header-Name: Header-Value</div>
                  </el-form-item>
                  
                  <el-form-item label="请求体模板">
                    <el-input
                      v-model="notificationForm.webhook_body"
                      type="textarea"
                      :rows="4"
                      placeholder='title: "$title"&#10;content: "$content"&#10;source: "我的项目"'
                    />
                    <div class="form-tip">支持变量：$title, $content</div>
                  </el-form-item>
                </template>
                
                <el-form-item>
                  <el-button type="primary" @click="saveNotificationSettings" :loading="saving">
                    保存设置
                  </el-button>
                  <el-button v-if="notificationForm.enabled" @click="testNotification">
                    测试通知
                  </el-button>
                </el-form-item>
              </el-form>
            </div>
            
            <el-divider />
            
            <!-- 其他自定义字段 -->
            <div class="setting-section">
              <h3>其他自定义字段</h3>
              <div class="custom-fields">
                <div v-for="field in customNotificationFields" :key="field.name" class="field-item">
                  <span class="field-name">{{ field.name }}:</span>
                  <span class="field-value">{{ field.value }}</span>
                  <el-button
                    type="text"
                    size="small"
                    @click="deleteCustomField(field.name)"
                  >
                    删除
                  </el-button>
                </div>
              </div>
              
              <div class="add-field">
                <el-input
                  v-model="newField.name"
                  placeholder="字段名"
                  style="width: 200px; margin-right: 8px;"
                />
                <el-input
                  v-model="newField.value"
                  placeholder="字段值"
                  style="width: 300px; margin-right: 8px;"
                />
                <el-button @click="addCustomField">添加</el-button>
              </div>
            </div>
          </el-card>
        </el-tab-pane>

        <!-- 定时设置 -->
        <el-tab-pane label="定时设置" name="scheduling">
          <el-card>
            <div class="setting-section">
              <h3>默认定时配置</h3>
              <div class="form-tip" style="margin-bottom: 16px; font-size: 14px; color: #909399;">
                系统默认启用定时任务功能，您可以配置默认的执行计划
              </div>
              <el-form :model="cronForm" label-width="150px">
                <el-form-item label="默认执行计划">
                  <div class="cron-schedule-container">
                    <div class="cron-schedule-list">
                      <div 
                        v-for="(schedule, index) in cronForm.default_schedule" 
                        :key="index"
                        class="cron-schedule-item"
                      >
                        <el-input
                          v-model="cronForm.default_schedule[index]"
                          placeholder="例如：0 9 * * * 表示每天9点执行"
                          class="cron-input"
                        />
                        <el-button 
                          type="danger" 
                          size="small" 
                          @click="removeCronSchedule(index)"
                          class="remove-btn"
                        >
                          <el-icon><Delete /></el-icon>
                          删除
                        </el-button>
                      </div>
                    </div>
                    
                    <div class="form-tip">
                      <p><strong>Cron表达式格式：</strong>分 时 日 月 星期</p>
                      <p><strong>示例：</strong>57 20,23 * * * 表示每天20:57和23:57执行</p>
                    </div>
                  </div>
                </el-form-item>
                
                <el-form-item>
                  <el-button 
                    type="success" 
                    @click="addCronSchedule"
                    style="margin-right: 8px;"
                  >
                    <el-icon><Plus /></el-icon>
                    添加执行计划
                  </el-button>
                  <el-button type="primary" @click="saveCronSettings" :loading="saving">
                    保存设置
                  </el-button>
                </el-form-item>
              </el-form>
            </div>
          </el-card>
        </el-tab-pane>

        <!-- 分享设置 -->
        <el-tab-pane label="分享设置" name="sharing">
          <el-card>
            <div class="setting-section">
              <h3>默认分享配置</h3>
              <div class="form-tip" style="margin-bottom: 16px; font-size: 14px; color: #909399;">
                系统默认启用分享功能，您可以配置创建分享链接时的默认参数
              </div>
              <el-form :model="shareForm" label-width="150px">
                <el-form-item label="默认分享密码">
                  <el-input
                    v-model="shareForm.default_password"
                    placeholder="请输入默认分享密码"
                    maxlength="10"
                    show-word-limit
                    style="width: 200px;"
                  />
                  <div class="form-tip">
                    创建分享链接时的默认密码，可以是数字或字母组合，长度1-10位
                  </div>
                </el-form-item>
                
                <el-form-item label="有效期设置">
                  <el-input-number
                    v-model="shareForm.default_period_days"
                    :min="0"
                    :max="999"
                    style="width: 150px;"
                    placeholder="0"
                  />
                  <span style="margin-left: 8px; color: #666">天</span>
                  <div class="form-tip">分享链接的有效期，0 为永久有效</div>
                </el-form-item>
                
                <el-form-item>
                  <el-button type="primary" @click="saveShareSettings" :loading="saving">
                    保存设置
                  </el-button>
                </el-form-item>
              </el-form>
            </div>
          </el-card>
        </el-tab-pane>

        <!-- 账户设置 -->
        <el-tab-pane label="账户设置" name="account">
          <el-card>
            <div class="setting-section">
              <h3>账户信息</h3>
              <el-form label-width="120px">
                <el-form-item label="当前用户名">
                  <el-input :value="username" readonly disabled style="width: 300px;">
                    <template #prefix>
                      <el-icon><User /></el-icon>
                    </template>
                  </el-input>
                  <div class="form-tip">用户名无法修改</div>
                </el-form-item>
              </el-form>
            </div>

            <el-divider />

            <div class="setting-section">
              <h3>修改密码</h3>
              <el-form :model="accountForm" label-width="120px">
                <el-form-item label="当前密码">
                  <el-input
                    v-model="accountForm.currentPassword"
                    type="password"
                    placeholder="请输入当前密码"
                    style="width: 300px;"
                    show-password
                  />
                </el-form-item>
                
                <el-form-item label="新密码">
                  <el-input
                    v-model="accountForm.newPassword"
                    type="password"
                    placeholder="请输入新密码（至少6位）"
                    style="width: 300px;"
                    show-password
                  />
                </el-form-item>
                
                <el-form-item label="确认新密码">
                  <el-input
                    v-model="accountForm.confirmPassword"
                    type="password"
                    placeholder="请再次输入新密码"
                    style="width: 300px;"
                    show-password
                  />
                </el-form-item>
                
                <el-form-item>
                  <el-button type="primary" @click="saveAccountSettings" :loading="accountSaving">
                    修改密码
                  </el-button>
                  <el-button @click="accountForm.currentPassword = ''; accountForm.newPassword = ''; accountForm.confirmPassword = ''">
                    重置
                  </el-button>
                </el-form-item>
              </el-form>
            </div>
          </el-card>
        </el-tab-pane>

        <!-- 系统设置 -->
        <el-tab-pane label="系统设置" name="general">
          <el-card>
            <!-- 重试配置 -->
            <div class="setting-section">
              <h3>重试配置</h3>
              <el-form :model="retryForm" label-width="150px">
                <el-form-item label="最大重试次数">
                  <el-input-number
                    v-model="retryForm.max_attempts"
                    :min="1"
                    :max="10"
                    style="width: 150px;"
                  />
                  <div class="form-tip">任务执行失败时的最大重试次数</div>
                </el-form-item>
                
                <el-form-item label="重试延迟">
                  <el-input-number
                    v-model="retryForm.delay_seconds"
                    :min="1"
                    :max="300"
                    style="width: 150px;"
                  />
                  <span style="margin-left: 8px; color: #666">秒</span>
                  <div class="form-tip">重试前的等待时间</div>
                </el-form-item>
              </el-form>
            </div>

            <el-divider />

            <!-- 调度器配置 -->
            <div class="setting-section">
              <h3>调度器配置</h3>
              <el-form :model="schedulerForm" label-width="150px">
                <el-form-item label="最大工作线程">
                  <el-input-number
                    v-model="schedulerForm.max_workers"
                    :min="1"
                    :max="10"
                    style="width: 150px;"
                  />
                  <div class="form-tip">同时执行任务的最大数量</div>
                </el-form-item>
                
                <el-form-item label="错过执行宽限期">
                  <el-input-number
                    v-model="schedulerForm.misfire_grace_time"
                    :min="60"
                    :max="7200"
                    style="width: 150px;"
                  />
                  <span style="margin-left: 8px; color: #666">秒</span>
                  <div class="form-tip">任务错过执行时间后的宽限期</div>
                </el-form-item>
                
                <el-form-item label="合并相同任务">
                  <el-switch v-model="schedulerForm.coalesce" />
                  <div class="form-tip">是否将多个相同的待执行任务合并为一个</div>
                </el-form-item>
                
                <el-form-item label="最大实例数">
                  <el-input-number
                    v-model="schedulerForm.max_instances"
                    :min="1"
                    :max="10"
                    style="width: 150px;"
                  />
                  <div class="form-tip">同一个任务同时运行的最大实例数</div>
                </el-form-item>
              </el-form>
            </div>

            <el-divider />

            <!-- 文件操作配置 -->
            <div class="setting-section">
              <h3>文件操作配置</h3>
              <el-form :model="fileOpsForm" label-width="150px">
                <el-form-item label="重命名延迟">
                  <el-input-number
                    v-model="fileOpsForm.rename_delay_seconds"
                    :min="0"
                    :max="10"
                    :precision="1"
                    :step="0.1"
                    style="width: 150px;"
                  />
                  <span style="margin-left: 8px; color: #666">秒</span>
                  <div class="form-tip">文件重命名操作间的延迟时间</div>
                </el-form-item>
                
                <el-form-item label="批处理大小">
                  <el-input-number
                    v-model="fileOpsForm.batch_size"
                    :min="10"
                    :max="200"
                    style="width: 150px;"
                  />
                  <div class="form-tip">单次处理的文件数量</div>
                </el-form-item>
                
                <el-form-item label="并发限制">
                  <el-input-number
                    v-model="fileOpsForm.concurrent_limit"
                    :min="1"
                    :max="10"
                    style="width: 150px;"
                  />
                  <div class="form-tip">同时进行的文件操作数量</div>
                </el-form-item>
              </el-form>
            </div>

            <el-divider />

            <!-- 配额告警配置 -->
            <div class="setting-section">
              <h3>配额告警配置</h3>
              <el-form :model="quotaAlertForm" label-width="150px">
                <el-form-item label="启用配额告警">
                  <el-switch v-model="quotaAlertForm.enabled" />
                  <div class="form-tip">当存储空间使用率达到阈值时发送告警</div>
                </el-form-item>
                
                <template v-if="quotaAlertForm.enabled">
                  <el-form-item label="告警阈值">
                    <el-input-number
                      v-model="quotaAlertForm.threshold_percent"
                      :min="50"
                      :max="99"
                      style="width: 150px;"
                    />
                    <span style="margin-left: 8px; color: #666">%</span>
                    <div class="form-tip">存储空间使用率达到此百分比时触发告警</div>
                  </el-form-item>
                  
                  <el-form-item label="检查频率">
                    <el-input
                      v-model="quotaAlertForm.check_schedule"
                      placeholder="0 0 * * *"
                      style="width: 200px;"
                    />
                    <div class="form-tip">Cron表达式，如：0 0 * * * 表示每天午夜检查</div>
                  </el-form-item>
                </template>
              </el-form>
            </div>

            <el-divider />

            <!-- 认证配置 -->
            <div class="setting-section">
              <h3>认证配置</h3>
              <el-form :model="authForm" label-width="150px">
                <el-form-item label="管理员用户名">
                  <el-input
                    v-model="authForm.users"
                    placeholder="管理员用户名"
                    style="width: 200px;"
                  />
                  <div class="form-tip">系统管理员的登录用户名</div>
                </el-form-item>
                
                <el-form-item label="管理员密码">
                  <el-input
                    v-model="authForm.password"
                    type="password"
                    placeholder="管理员密码"
                    style="width: 200px;"
                    show-password
                  />
                  <div class="form-tip">系统管理员的登录密码</div>
                </el-form-item>
                
                <el-form-item label="会话超时时间">
                  <el-input-number
                    v-model="authForm.session_timeout"
                    :min="300"
                    :max="86400"
                    style="width: 150px;"
                  />
                  <span style="margin-left: 8px; color: #666">秒</span>
                  <div class="form-tip">用户登录后的会话有效期，单位：秒</div>
                </el-form-item>
              </el-form>
            </div>
            
            <div style="text-align: right; margin-top: 20px;">
              <el-button type="primary" @click="saveSystemSettings" :loading="saving">
                保存系统设置
              </el-button>
            </div>
          </el-card>
        </el-tab-pane>

        <!-- 版本信息 -->
        <el-tab-pane label="版本信息" name="version">
          <el-card>
            <div class="setting-section">
              <h3>版本信息</h3>
              <div class="version-info">
                <div class="info-item">
                  <span class="info-label">当前版本：</span>
                  <span class="info-value">{{ APP_VERSION }}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">构建时间：</span>
                  <span class="info-value">{{ BUILD_TIME }}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">最新版本：</span>
                  <span class="info-value">{{ latestVersion || '检查中...' }}</span>
                  <el-tag v-if="hasUpdate" type="warning" size="small" style="margin-left: 8px">
                    有更新
                  </el-tag>
                </div>
                <div class="info-item">
                  <span class="info-label">更新说明：</span>
                  <span class="info-value">{{ RELEASE_NOTES }}</span>
                </div>
              </div>
              
              <el-button type="primary" @click="handleVersionCheck" :loading="checking">
                检查更新
              </el-button>
            </div>
          </el-card>
        </el-tab-pane>
      </el-tabs>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus, Delete, User } from '@element-plus/icons-vue'
import { storeToRefs } from 'pinia'
import { useConfigStore, useVersionStore, useAuthStore } from '@/stores'
import { APP_VERSION, BUILD_TIME, RELEASE_NOTES } from '@/config/version'

const configStore = useConfigStore()
const versionStore = useVersionStore()
const authStore = useAuthStore()
const { config, loading, saving, notificationFields } = storeToRefs(configStore)
const { latestVersion, hasUpdate, checking } = storeToRefs(versionStore)
const { username } = storeToRefs(authStore)

// 版本检查方法
const handleVersionCheck = () => {
  versionStore.checkForUpdates() // 检查版本
}

const activeTab = ref('notification')

// 表单数据
const notificationForm = reactive({
  enabled: false,
  notification_delay: 30,
  push_plus_token: '',
  push_plus_user: '',
  webhook_url: '',
  webhook_method: 'POST',
  webhook_content_type: 'application/json',
  webhook_headers: 'Content-Type: application/json',
  webhook_body: 'title: "$title"\ncontent: "$content"\nsource: "我的项目"'
})

// 定时任务配置 (对应config.json中的cron) - 默认启用
const cronForm = reactive({
  default_schedule: ['57 20,23 * * *', '53 12 * * *']
})

// 分享配置 (对应config.json中的share) - 默认启用
const shareForm = reactive({
  default_password: '8888',
  default_period_days: 7
})

// 账户设置表单
const accountForm = reactive({
  currentPassword: '',
  newPassword: '',
  confirmPassword: ''
})

const accountSaving = ref(false)

// 重试配置 (对应config.json中的retry)
const retryForm = reactive({
  max_attempts: 3,
  delay_seconds: 5
})

// 调度器配置 (对应config.json中的scheduler)
const schedulerForm = reactive({
  max_workers: 1,
  misfire_grace_time: 3600,
  coalesce: true,
  max_instances: 1
})

// 文件操作配置 (对应config.json中的file_operations)
const fileOpsForm = reactive({
  rename_delay_seconds: 0.5,
  batch_size: 50,
  concurrent_limit: 1
})

// 配额告警配置 (对应config.json中的quota_alert)
const quotaAlertForm = reactive({
  enabled: true,
  threshold_percent: 98,
  check_schedule: '0 0 * * *'
})

// 认证配置 (对应config.json中的auth)
const authForm = reactive({
  users: 'koko',
  password: 'kokojy1996',
  session_timeout: 3600
})

// 自定义通知字段（除了内置字段外的其他字段）
const customNotificationFields = ref<Array<{ name: string; value: string }>>([]);

const newField = reactive({
  name: '',
  value: ''
})

// 方法
const saveNotificationSettings = async () => {
  try {
    await configStore.updateNotificationConfig(notificationForm)
    ElMessage.success('通知设置已保存')
  } catch (error) {
    ElMessage.error(`保存失败：${error}`)
  }
}

const saveCronSettings = async () => {
  try {
    await configStore.updateCronConfig(cronForm)
    ElMessage.success('定时设置已保存')
  } catch (error) {
    ElMessage.error(`保存失败：${error}`)
  }
}

const saveShareSettings = async () => {
  try {
    await configStore.updateShareConfig(shareForm)
    ElMessage.success('分享设置已保存')
  } catch (error) {
    ElMessage.error(`保存失败：${error}`)
  }
}

const saveSystemSettings = async () => {
  try {
    // 保存所有系统设置
    await Promise.all([
      configStore.updateRetryConfig(retryForm),
      configStore.updateSchedulerConfig(schedulerForm),
      configStore.updateFileOpsConfig(fileOpsForm),
      configStore.updateQuotaAlertConfig(quotaAlertForm),
      configStore.updateAuthConfig(authForm)
    ])
    ElMessage.success('系统设置已保存')
  } catch (error) {
    ElMessage.error(`保存失败：${error}`)
  }
}

// 保存账户设置
const saveAccountSettings = async () => {
  // 验证表单
  if (!accountForm.currentPassword) {
    ElMessage.warning('请输入当前密码')
    return
  }
  if (!accountForm.newPassword) {
    ElMessage.warning('请输入新密码')
    return
  }
  if (accountForm.newPassword !== accountForm.confirmPassword) {
    ElMessage.warning('两次输入的密码不一致')
    return
  }
  if (accountForm.newPassword.length < 6) {
    ElMessage.warning('新密码至少需要6位')
    return
  }

  accountSaving.value = true
  try {
    await authStore.updatePassword(accountForm.currentPassword, accountForm.newPassword)
    ElMessage.success('密码修改成功')
    // 清空表单
    accountForm.currentPassword = ''
    accountForm.newPassword = ''
    accountForm.confirmPassword = ''
  } catch (error) {
    ElMessage.error(`密码修改失败：${error}`)
  } finally {
    accountSaving.value = false
  }
}

const testNotification = async () => {
  try {
    await configStore.testNotification()
    ElMessage.success('测试通知已发送')
  } catch (error) {
    ElMessage.error(`测试失败：${error}`)
  }
}

const addNotificationField = async () => {
  if (!newField.name || !newField.value) {
    ElMessage.warning('请填写字段名和值')
    return
  }
  
  try {
    await configStore.addNotificationField(newField.name, newField.value)
    ElMessage.success('字段已添加')
    newField.name = ''
    newField.value = ''
  } catch (error) {
    ElMessage.error(`添加失败：${error}`)
  }
}

const deleteNotificationField = async (name: string) => {
  try {
    await configStore.deleteNotificationField(name)
    ElMessage.success('字段已删除')
  } catch (error) {
    ElMessage.error(`删除失败：${error}`)
  }
}

// cron计划管理
const addCronSchedule = () => {
  cronForm.default_schedule.push('')
}

const removeCronSchedule = (index: number) => {
  cronForm.default_schedule.splice(index, 1)
}

// 自定义字段管理
const addCustomField = async () => {
  if (!newField.name || !newField.value) {
    ElMessage.warning('请填写字段名和值')
    return
  }
  
  try {
    await configStore.addCustomNotificationField(newField.name, newField.value)
    customNotificationFields.value.push({
      name: newField.name,
      value: newField.value
    })
    ElMessage.success('自定义字段已添加')
    newField.name = ''
    newField.value = ''
  } catch (error) {
    ElMessage.error(`添加失败：${error}`)
  }
}

const deleteCustomField = async (name: string) => {
  try {
    await configStore.deleteCustomNotificationField(name)
    const index = customNotificationFields.value.findIndex(field => field.name === name)
    if (index > -1) {
      customNotificationFields.value.splice(index, 1)
    }
    ElMessage.success('自定义字段已删除')
  } catch (error) {
    ElMessage.error(`删除失败：${error}`)
  }
}

// 初始化表单数据
const initForms = () => {
  if (!config.value) return
  
  // 通知设置 (从config.notify加载)
  if (config.value.notify) {
    notificationForm.enabled = config.value.notify.enabled || false
    notificationForm.notification_delay = config.value.notify.notification_delay || 30
    
    // 从direct_fields加载具体配置
    const fields = config.value.notify.direct_fields || {}
    notificationForm.push_plus_token = fields.PUSH_PLUS_TOKEN || ''
    notificationForm.push_plus_user = fields.PUSH_PLUS_USER || ''
    notificationForm.webhook_url = fields.WEBHOOK_URL || ''
    notificationForm.webhook_method = fields.WEBHOOK_METHOD || 'POST'
    notificationForm.webhook_content_type = fields.WEBHOOK_CONTENT_TYPE || 'application/json'
    notificationForm.webhook_headers = fields.WEBHOOK_HEADERS || 'Content-Type: application/json'
    notificationForm.webhook_body = fields.WEBHOOK_BODY || 'title: "$title"\ncontent: "$content"\nsource: "我的项目"'
  }
  
  // 定时设置 (从config.cron加载) - 默认启用
  if (config.value.cron) {
    cronForm.default_schedule = [...(config.value.cron.default_schedule || ['57 20,23 * * *', '53 12 * * *'])]
  }
  
  // 分享设置 (从config.share加载) - 默认启用
  if (config.value.share) {
    shareForm.default_password = config.value.share.default_password || '8888'
    shareForm.default_period_days = config.value.share.default_period_days || 7
  }
  
  // 重试设置 (从config.retry加载)
  if (config.value.retry) {
    retryForm.max_attempts = config.value.retry.max_attempts || 3
    retryForm.delay_seconds = config.value.retry.delay_seconds || 5
  }
  
  // 调度器设置 (从config.scheduler加载)
  if (config.value.scheduler) {
    schedulerForm.max_workers = config.value.scheduler.max_workers || 1
    schedulerForm.misfire_grace_time = config.value.scheduler.misfire_grace_time || 3600
    schedulerForm.coalesce = config.value.scheduler.coalesce !== false
    schedulerForm.max_instances = config.value.scheduler.max_instances || 1
  }
  
  // 文件操作设置 (从config.file_operations加载)
  if (config.value.file_operations) {
    fileOpsForm.rename_delay_seconds = config.value.file_operations.rename_delay_seconds || 0.5
    fileOpsForm.batch_size = config.value.file_operations.batch_size || 50
    fileOpsForm.concurrent_limit = config.value.file_operations.concurrent_limit || 1
  }
  
  // 配额告警设置 (从config.quota_alert加载)
  if (config.value.quota_alert) {
    quotaAlertForm.enabled = config.value.quota_alert.enabled || false
    quotaAlertForm.threshold_percent = config.value.quota_alert.threshold_percent || 98
    quotaAlertForm.check_schedule = config.value.quota_alert.check_schedule || '0 0 * * *'
  }
  
  // 认证设置 (从config.auth加载)
  if (config.value.auth) {
    authForm.users = config.value.auth.users || ''
    authForm.password = config.value.auth.password || ''
    authForm.session_timeout = config.value.auth.session_timeout || 3600
  }
}

onMounted(async () => {
  await configStore.fetchConfig()
  initForms()
})
</script>

<style scoped>
.settings-view {
  padding: 24px;
  min-height: 100vh;
  background-color: #f5f5f5;
}

.page-header {
  margin-bottom: 24px;
}

.page-title {
  font-size: 24px;
  font-weight: 600;
  color: #333;
  margin: 0;
}

.settings-content {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

.settings-tabs {
  padding: 20px;
}

.setting-section {
  margin-bottom: 24px;
}

.setting-section h3 {
  font-size: 16px;
  font-weight: 600;
  color: #333;
  margin-bottom: 16px;
}

.custom-fields {
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  padding: 16px;
}

.field-item {
  display: flex;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid #f0f0f0;
}

.field-item:last-child {
  border-bottom: none;
  margin-bottom: 16px;
}

.field-name {
  font-weight: 500;
  color: #333;
  min-width: 100px;
}

.field-value {
  flex: 1;
  margin-left: 16px;
  color: #666;
}

.add-field {
  display: flex;
  align-items: center;
}

.version-info {
  margin-bottom: 20px;
}

.info-item {
  display: flex;
  align-items: center;
  padding: 8px 0;
}

.info-label {
  min-width: 100px;
  font-weight: 500;
  color: #333;
}

.info-value {
  color: #666;
}

/* 新增表单样式 */
.form-tip {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
  line-height: 1.4;
}

.cron-schedule-container {
  width: 100%;
}

.cron-schedule-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
}

.cron-schedule-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px;
  background: #fafafa;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  transition: all 0.3s ease;
}

.cron-schedule-item:hover {
  background: #f5f7fa;
  border-color: #c6e2ff;
}

.cron-input {
  flex: 1;
  max-width: 350px;
}

.remove-btn {
  flex-shrink: 0;
}


/* 响应式设计 - 统一断点为1200px */
@media (max-width: 1200px) {
  .settings-view {
    padding: 16px;
  }
  
  .settings-tabs {
    padding: 16px;
  }
  
  .add-field {
    flex-direction: column;
    gap: 8px;
    align-items: stretch;
  }
  
  .add-field .el-input {
    width: 100% !important;
  }
  
  .cron-schedule-item {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }
  
  .cron-input {
    max-width: 100%;
  }
  
  .remove-btn {
    align-self: flex-end;
  }
  
  /* 移动端优化按钮大小 */
  :deep(.el-button) {
    min-height: 44px;
    padding: 12px 16px;
  }
  
  /* 移动端优化输入框 */
  :deep(.el-input__inner),
  :deep(.el-textarea__inner) {
    min-height: 44px;
    font-size: 16px; /* 防止iOS放大 */
  }
  
  /* 移动端优化表单标签 */
  :deep(.el-form-item__label) {
    margin-bottom: 8px;
    font-weight: 500;
  }
  
  /* 移动端tabs滑动支持 - 更深层级样式 */
  :deep(.el-tabs--top .el-tabs__nav-wrap) {
    overflow-x: auto !important;
    overflow-y: hidden !important;
    -webkit-overflow-scrolling: touch !important; /* iOS流畅滑动 */
    scrollbar-width: none !important; /* Firefox隐藏滚动条 */
    -ms-overflow-style: none !important; /* IE/Edge隐藏滚动条 */
    touch-action: pan-x !important; /* 启用水平滑动 */
  }
  
  :deep(.el-tabs--top .el-tabs__nav-wrap::-webkit-scrollbar) {
    display: none !important; /* Chrome/Safari隐藏滚动条 */
  }
  
  :deep(.el-tabs--top .el-tabs__nav-scroll) {
    padding: 0 16px !important;
    white-space: nowrap !important;
    overflow-x: auto !important;
    overflow-y: hidden !important;
  }
  
  :deep(.el-tabs--top .el-tabs__nav) {
    display: inline-flex !important;
    min-width: max-content !important; /* 确保内容宽度足够 */
    width: auto !important;
    flex-wrap: nowrap !important;
  }
  
  :deep(.el-tabs--top .el-tabs__item) {
    padding: 12px 16px !important;
    font-size: 14px !important;
    white-space: nowrap !important;
    flex-shrink: 0 !important;
    min-width: auto !important;
    display: inline-block !important;
  }
  
  /* 禁用Element Plus的默认transform */
  :deep(.el-tabs--top .el-tabs__nav-scroll) {
    transform: none !important;
  }
  
  /* 确保tabs容器可以滚动 */
  :deep(.el-tabs__header) {
    overflow: hidden !important;
  }
  
  /* 移动端卡片优化 */
  :deep(.el-card) {
    margin-bottom: 16px;
    border-radius: 12px;
  }
  
  :deep(.el-card__body) {
    padding: 16px;
  }
}
</style>
