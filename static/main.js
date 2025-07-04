// 应用版本号和配置
const APP_VERSION = 'v1.0.8';
const GITHUB_REPO = 'kokojacket/baidu-autosave';

// 本地缓存管理
const CACHE_KEY = {
    TASKS: 'baidu_autosave_tasks',
    USERS: 'baidu_autosave_users',
    CONFIG: 'baidu_autosave_config',
    HISTORY: 'baidu_autosave_field_history'
};

// 检查是否有异常任务并更新异常按钮的状态
function updateErrorIndicator() {
    const hasErrorTasks = state.tasks.some(task => task.status === 'error');
    const errorButton = document.querySelector('.status-btn[data-status="error"]');
    
    if (errorButton) {
        if (hasErrorTasks) {
            errorButton.classList.add('has-error');
        } else {
            errorButton.classList.remove('has-error');
        }
    }
}

function saveToCache(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify(data));
    } catch (error) {
        console.error('缓存保存失败:', error);
    }
}

function loadFromCache(key) {
    try {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : null;
    } catch (error) {
        console.error('缓存读取失败:', error);
        return null;
    }
}

function clearCache() {
    Object.values(CACHE_KEY).forEach(key => {
        localStorage.removeItem(key);
    });
}

// 移除WebSocket配置，添加轮询配置
const POLLING_CONFIG = {
    enabled: true,
    interval: 5000, // 轮询间隔（毫秒）
    tasks_interval: 5000, // 任务列表轮询间隔
    task_status_interval: 3000, // 任务状态轮询间隔（执行中的任务）
    timeout: 300000 // 轮询超时时间（毫秒），5分钟
};

// 全局状态管理
const state = {
    tasks: [],
    users: [],
    config: {},
    currentUser: null,
    categories: new Set(), // 用于存储所有已使用的分类
    isLoggedIn: false, // 添加登录状态标记
    sessionCheckInterval: null, // 添加会话检查定时器
    runningTasks: new Set(), // 存储正在执行的任务ID
    pollingTimers: {}, // 存储轮询定时器
    lastPollingTime: 0 // 上次轮询时间
};

// 移除WebSocket连接管理相关代码

// 添加轮询函数
function startTaskPolling() {
    // 清除已有的轮询
    if (state.pollingTimers.tasks) {
        clearTimeout(state.pollingTimers.tasks);
    }
    
    // 定期轮询所有任务状态
    function pollTasks() {
        if (!POLLING_CONFIG.enabled || !state.isLoggedIn) return;
        
        callApi('/api/tasks', 'GET', null, false)
            .then(response => {
                if (response && response.success) {
                    // 更新本地任务状态
                    updateTasksWithChangedStatus(response.tasks);
                    
                    // 检查是否有运行中的任务，为这些任务设置更高频率的状态轮询
                    const runningTasks = response.tasks.filter(task => task.status === 'running');
                    runningTasks.forEach(task => {
                        const taskId = task.order - 1; // 转换为前端的task_id
                        if (!state.runningTasks.has(taskId)) {
                            state.runningTasks.add(taskId);
                            startTaskStatusPolling(taskId);
                        }
                    });
                    
                    // 移除已经完成的任务
                    const runningIds = new Set(runningTasks.map(task => task.order - 1));
                    Array.from(state.runningTasks).forEach(taskId => {
                        if (!runningIds.has(taskId)) {
                            state.runningTasks.delete(taskId);
                            if (state.pollingTimers[`task_${taskId}`]) {
                                clearTimeout(state.pollingTimers[`task_${taskId}`]);
                                delete state.pollingTimers[`task_${taskId}`];
                            }
                        }
                    });
                }
            })
            .catch(error => console.error('轮询任务失败:', error))
            .finally(() => {
                // 设置下一次轮询
                state.pollingTimers.tasks = setTimeout(pollTasks, POLLING_CONFIG.tasks_interval);
            });
    }
    
    // 启动初次轮询
    pollTasks();
}

// 为特定正在运行的任务启动高频率轮询
function startTaskStatusPolling(taskId) {
    if (state.pollingTimers[`task_${taskId}`]) {
        clearTimeout(state.pollingTimers[`task_${taskId}`]);
    }
    
    let startTime = Date.now();
    
    function pollTaskStatus() {
        if (!state.runningTasks.has(taskId) || !state.isLoggedIn) return;
        
        // 检查是否超过超时时间
        if (Date.now() - startTime > POLLING_CONFIG.timeout) {
            state.runningTasks.delete(taskId);
            return;
        }
        
        callApi(`/api/tasks/${taskId}/status`, 'GET', null, false)
            .then(response => {
                if (response && response.success) {
                    const taskStatus = response.status;
                    if (taskStatus) {
                        // 更新任务状态
                        updateTaskStatus(taskId, taskStatus.status, taskStatus.message);
                        
                        // 如果任务已完成或出错，停止轮询
                        if (taskStatus.status !== 'running') {
                            state.runningTasks.delete(taskId);
                            return;
                        }
                    }
                }
            })
            .catch(error => console.error(`轮询任务状态失败 (任务ID: ${taskId}):`, error))
            .finally(() => {
                // 如果任务仍在运行，设置下一次轮询
                if (state.runningTasks.has(taskId)) {
                    state.pollingTimers[`task_${taskId}`] = setTimeout(pollTaskStatus, POLLING_CONFIG.task_status_interval);
                }
            });
    }
    
    // 立即开始轮询
    pollTaskStatus();
}

// 更新任务列表，比较新旧状态
function updateTasksWithChangedStatus(newTasks) {
    if (!newTasks || !Array.isArray(newTasks)) return;
    
    // 确保任务按order排序
    newTasks.sort((a, b) => (a.order || 0) - (b.order || 0));
    
    let tasksChanged = false;
    
    // 检查任务是否有更改
    if (state.tasks.length !== newTasks.length) {
        tasksChanged = true;
    } else {
        for (let i = 0; i < newTasks.length; i++) {
            const oldTask = state.tasks[i];
            const newTask = newTasks[i];
            
            if (!oldTask || 
                oldTask.status !== newTask.status || 
                oldTask.last_execute_time !== newTask.last_execute_time) {
                tasksChanged = true;
                break;
            }
        }
    }
    
    // 如果有更改，更新状态并重新渲染
    if (tasksChanged) {
        state.tasks = newTasks;
        saveToCache(CACHE_KEY.TASKS, state.tasks);
        renderTasks();
        updateErrorIndicator();
    }
}

// 移除WebSocket消息处理相关函数

// 更新任务状态
function updateTaskStatus(taskId, status, message) {
    const taskElement = document.querySelector(`.task-item[data-task-id="${taskId}"]`);
    if (!taskElement) return;
    
    const statusElement = taskElement.querySelector('.task-status');
    if (statusElement) {
        statusElement.className = `task-status ${status}`;
        statusElement.textContent = getStatusText(status);
        
        // 添加上次执行时间显示
        const task = state.tasks.find(t => t.order === taskId + 1);
        if (task && task.last_execute_time) {
            const lastExecuteTime = new Date(task.last_execute_time * 1000).toLocaleString();
            const timeElement = taskElement.querySelector('.last-execute-time') || document.createElement('div');
            timeElement.className = 'last-execute-time';
            timeElement.textContent = `上次执行: ${lastExecuteTime}`;
            taskElement.querySelector('.task-details').appendChild(timeElement);
        }
    }
    
    // 保持原有按钮容器结构
    const buttonsContainer = taskElement.querySelector('.task-actions');
    if (buttonsContainer) {
        // 使用克隆节点避免重新创建元素
        const newButtons = buttonsContainer.cloneNode(true);
        newButtons.querySelectorAll('.btn-icon').forEach(btn => {
            btn.disabled = status === 'running';
            // 保持按钮可见性一致
            btn.style.visibility = 'visible'; 
        });
        buttonsContainer.parentNode.replaceChild(newButtons, buttonsContainer);
    }
    
    // 如果有消息，显示通知
    if (message) {
        showNotification(message, status === 'error' ? 'error' : 'info');
    }
    
    // 如果任务完成，也刷新一次任务列表
    if (status === 'completed' || status === 'error') {
        refreshTasks();
    }
}

// 更新任务进度
function updateTaskProgress(taskId, progress) {
    const taskElement = document.querySelector(`.task-item[data-task-id="${taskId}"]`);
    if (!taskElement) return;
    
    let progressBar = taskElement.querySelector('.progress-bar');
    if (!progressBar) {
        // 如果不存在进度条，创建一个
        const taskContent = taskElement.querySelector('.task-content');
        progressBar = document.createElement('div');
        progressBar.className = 'progress-bar';
        const progressElement = document.createElement('div');
        progressElement.className = 'progress';
        progressBar.appendChild(progressElement);
        taskContent.appendChild(progressBar);
    }
    
    const progressElement = progressBar.querySelector('.progress');
    if (progressElement) {
        progressElement.style.width = `${progress}%`;
        progressElement.setAttribute('aria-valuenow', progress);
    }
}

// 显示加载中效果
function showLoading(message = '加载中...') {
    const loading = document.createElement('div');
    loading.className = 'loading-overlay';
    loading.innerHTML = `
        <div class="loading-spinner"></div>
        <div class="loading-message">${message}</div>
    `;
    document.body.appendChild(loading);
}

// 通知显示
function showNotification(message, level = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${level}`;
    notification.textContent = message;
    
    const container = document.querySelector('.notification-container') || createNotificationContainer();
    container.appendChild(notification);
    
    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

function createNotificationContainer() {
    const container = document.createElement('div');
    container.className = 'notification-container';
    document.body.appendChild(container);
    return container;
}

// API调用函数
async function callApi(endpoint, method = 'GET', data = null, showLoadingIndicator = true) {
    if (showLoadingIndicator) {
        showLoading();
    }
    
    try {
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json'
            }
        };
        
        if (data) {
            options.body = JSON.stringify(data);
        }
        
        const response = await fetch(`/api/${endpoint}`, options);
        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.message);
        }
        
        return result;
    } catch (error) {
        showError(error.message);
        throw error;
    } finally {
        if (showLoadingIndicator) {
            hideLoading();
        }
    }
}

// 状态更新函数
function updateState(newState) {
    // 记录是否需要更新各个部分
    const needsTasksUpdate = 'tasks' in newState;
    const needsUsersUpdate = 'users' in newState;
    const needsConfigUpdate = 'config' in newState;
    const needsUserStatusUpdate = 'currentUser' in newState;
    
    // 更新状态
    Object.assign(state, newState);
    
    // 保存到本地缓存
    if (needsTasksUpdate) saveToCache(CACHE_KEY.TASKS, state.tasks);
    if (needsUsersUpdate) saveToCache(CACHE_KEY.USERS, state.users);
    if (needsConfigUpdate) saveToCache(CACHE_KEY.CONFIG, state.config);
    
    // 更新UI，避免重复渲染
    if (needsTasksUpdate) renderTasks();
    if (needsUsersUpdate) renderUsers();
    if (needsConfigUpdate) renderConfig();
    if (needsUserStatusUpdate) updateLoginStatus(state.currentUser);
}

// UI渲染函数
function renderUI() {
    renderTasks();
    renderUsers();
    renderConfig();
}

// 任务列表渲染
function renderTasks() {
    const taskList = document.querySelector('.task-list');
    if (!taskList) return;
    
    taskList.innerHTML = '';
    
    if (Array.isArray(state.tasks)) {
        state.tasks.forEach((task, index) => {
            task.id = task.id || index;
            const taskElement = createTaskElement(task);
            taskList.appendChild(taskElement);
        });
    }
    
    // 更新分类列表
    updateCategoryList();
    
    // 更新批量操作按钮状态
    updateBatchOperationUI();
    
    // 更新异常指示器
    updateErrorIndicator();
}

// 创建任务元素
function createTaskElement(task) {
    const div = document.createElement('div');
    div.className = 'task-item';
    div.dataset.taskId = task.order - 1;  // 使用 order-1 作为 taskId
    div.dataset.status = task.status;
    div.dataset.category = task.category || '';
    
    // 构建完整的URL
    const fullUrl = task.pwd ? `${task.url}?pwd=${task.pwd}` : task.url;
    
    // 格式化最后执行时间
    const lastExecuteTime = task.last_execute_time ? 
        new Date(task.last_execute_time * 1000).toLocaleString() : 
        '未执行';
    
    // 获取显示的消息
    const displayMessage = task.status === 'error' ? (task.error || task.message) : task.message;
    
    div.innerHTML = `
        <div class="task-item-left">
            <div class="drag-handle" title="拖动排序">
                <i class="material-icons">drag_indicator</i>
            </div>
            <label class="checkbox-wrapper">
                <input type="checkbox" class="checkbox-input" 
                       onclick="event.stopPropagation(); toggleTaskSelection(${task.order - 1})"
                       ${selectedTasks.has(task.order - 1) ? 'checked' : ''}>
                <span class="checkbox-custom"></span>
            </label>
        </div>
        <div class="task-content">
            <div class="task-header">
                <a href="${fullUrl}" target="_blank" class="task-name">${task.name || task.url}</a>
                <span class="task-status ${task.status}">${getStatusText(task.status)}</span>
                ${task.category ? `<span class="task-category">${task.category}</span>` : ''}
            </div>
            <div class="task-details">
                <span class="save-dir">保存目录：${task.save_dir}</span>
                <span class="cron-rule">${task.cron ? `自定义定时：${task.cron}` : `默认定时：${state.config.cron?.default_schedule || '未设置'}`}</span>
                <div class="last-execute-time">上次执行: ${lastExecuteTime}</div>
                ${displayMessage ? `<div class="task-message ${task.status === 'error' ? 'error' : ''}">${displayMessage}</div>` : ''}
            </div>
            ${task.status === 'running' ? `
            <div class="progress-bar">
                <div class="progress" style="width: ${task.progress || 0}%" 
                     aria-valuenow="${task.progress || 0}" aria-valuemin="0" aria-valuemax="100">
                </div>
            </div>
            ` : ''}
        </div>
        <div class="task-actions" style="min-width: 120px">
            <button class="btn-icon" onclick="executeTask(${task.order - 1})" 
                    ${task.status === 'running' ? 'disabled' : ''}>
                <i class="material-icons">play_arrow</i>
            </button>
            <button class="btn-icon" onclick="editTask(${task.order - 1})"
                    ${task.status === 'running' ? 'disabled' : ''}>
                <i class="material-icons">edit</i>
            </button>
            <button class="btn-icon danger" onclick="deleteTask(${task.order - 1})"
                    ${task.status === 'running' ? 'disabled' : ''}>
                <i class="material-icons">delete</i>
            </button>
        </div>
    `;
    
    return div;
}

// 用户列表渲染
function renderUsers() {
    const userList = document.querySelector('.user-list');
    if (!userList) return;
    
    userList.innerHTML = '';
    
    if (Array.isArray(state.users)) {
        state.users.forEach(user => {
            const userElement = createUserElement(user);
            userList.appendChild(userElement);
        });
    }
}

// 创建用户元素
function createUserElement(user) {
    const div = document.createElement('div');
    div.className = 'user-item';
    const isCurrentUser = user.is_current || (state.currentUser && state.currentUser.username === user.username);
    
    if (isCurrentUser) {
        div.classList.add('active');
    }
    
    div.innerHTML = `
        <div class="user-name">
            <span>${user.name || user.username}</span>
            ${isCurrentUser ? '<span class="badge">当前用户</span>' : ''}
        </div>
        <div class="user-actions">
            ${isCurrentUser ? `
                <button class="btn-icon" onclick="editUser('${user.username}')" title="编辑用户">
                    <i class="material-icons">edit</i>
                </button>
            ` : `
                <button class="btn-icon" onclick="switchUser('${user.username}')" title="切换到该用户">
                    <i class="material-icons">swap_horiz</i>
                </button>
                <button class="btn-icon" onclick="editUser('${user.username}')" title="编辑用户">
                    <i class="material-icons">edit</i>
                </button>
                <button class="btn-icon danger" onclick="deleteUser('${user.username}')" title="删除用户">
                    <i class="material-icons">delete</i>
                </button>
            `}
        </div>
    `;
    
    return div;
}

// 配置渲染
function renderConfig() {
    console.log('开始渲染配置，当前状态:', state);
    
    const notifyEnabled = document.getElementById('notify-enabled');
    const notifyFieldsContainer = document.getElementById('notify-fields-container');
    const globalCron = document.getElementById('global-cron');
    
    if (!globalCron) {
        console.error('未找到全局定时规则输入框元素');
        return;
    }
    
    // 处理通知配置
    if (state.config.notify) {
        console.log('渲染通知配置:', state.config.notify);
        notifyEnabled.checked = state.config.notify.enabled;
        
        // 清空现有字段
        notifyFieldsContainer.innerHTML = '';
        
        // 将通知配置转换为扁平结构
        const notifyFields = {};
        
        // 检查是否使用新格式
        if (state.config.notify.direct_fields) {
            // 使用新格式
            Object.assign(notifyFields, state.config.notify.direct_fields);
        } else if (state.config.notify.channels) {
            // 转换旧格式
            // 处理pushplus渠道
            if (state.config.notify.channels.pushplus) {
                const pushplus = state.config.notify.channels.pushplus;
                if (pushplus.token) {
                    notifyFields['PUSH_PLUS_TOKEN'] = pushplus.token;
                }
                if (pushplus.topic) {
                    notifyFields['PUSH_PLUS_USER'] = pushplus.topic;
                }
            }
            
            // 如果有其他渠道，这里可以继续添加转换逻辑
        }
        
        // 添加自定义字段
        if (state.config.notify.custom_fields) {
            Object.assign(notifyFields, state.config.notify.custom_fields);
        }
        
        // 渲染通知字段
        Object.entries(notifyFields).forEach(([key, value]) => {
            addNotifyFieldToUI(key, value);
        });
    }
    
    // 处理定时配置
    console.log('开始处理定时配置，完整配置对象:', state.config);
    const cronRules = [];
    
    // 从cron配置中获取
    if (state.config.cron) {
        const defaultSchedule = state.config.cron.default_schedule;
        console.log('从cron配置获取定时规则:', defaultSchedule);
        
        if (Array.isArray(defaultSchedule)) {
            cronRules.push(...defaultSchedule);
        } else if (typeof defaultSchedule === 'string') {
            // 如果是字符串，按分号分割
            const rules = defaultSchedule.split(';').map(rule => rule.trim()).filter(Boolean);
            cronRules.push(...rules);
        }
    }
    // 如果cron中没有，则从scheduler配置中获取
    else if (state.config.scheduler) {
        console.log('从scheduler配置获取定时规则:', state.config.scheduler);
        if (state.config.scheduler.global_cron) {
            cronRules.push(state.config.scheduler.global_cron);
        }
        if (Array.isArray(state.config.scheduler.additional_rules)) {
            cronRules.push(...state.config.scheduler.additional_rules);
        }
    }
    
    // 如果没有任何规则，使用默认值
    if (cronRules.length === 0) {
        cronRules.push('*/5 * * * *');  // 使用配置模板中的默认值
    }
    
    // 设置输入框的值
    const cronValue = cronRules.join(';');
    console.log('最终定时规则字符串:', cronValue);
    globalCron.value = cronValue;
}

// 添加通知字段到UI
function addNotifyFieldToUI(key, value) {
    const container = document.getElementById('notify-fields-container');
    
    const fieldDiv = document.createElement('div');
    fieldDiv.className = 'notify-field';
    fieldDiv.dataset.key = key;
    
    const keyInput = document.createElement('input');
    keyInput.type = 'text';
    keyInput.className = 'field-name';
    keyInput.value = key;
    keyInput.readOnly = true;
    
    const valueInput = document.createElement('input');
    valueInput.type = 'text';
    valueInput.className = 'field-value';
    valueInput.value = value || '';
    valueInput.placeholder = '字段值';
    
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'icon-btn delete';
    deleteBtn.innerHTML = '<i class="material-icons">delete</i>';
    deleteBtn.onclick = async function() {
        try {
            // 确认删除
            if (!confirm(`确定要删除字段 ${key} 吗？`)) {
                return;
            }
            
            showLoading(`正在删除字段 ${key}...`);
            
            // 直接从UI中删除
            container.removeChild(fieldDiv);
            
            // 如果不是初始加载时渲染的，直接返回
            const saveBtn = document.getElementById('save-settings-btn');
            if (saveBtn && !saveBtn.disabled) {
                showSuccess(`字段 ${key} 已删除，点击保存按钮生效`);
                hideLoading();
                return;
            }
            
            // 发送请求删除远程字段
            const result = await callApi('notify/fields', 'DELETE', { name: key });
            if (result.success) {
                showSuccess(result.message || `字段 ${key} 已删除`);
            } else {
                throw new Error(result.message || `删除字段 ${key} 失败`);
            }
        } catch (error) {
            console.error('删除通知字段失败:', error);
            showError(error.message || '删除通知字段失败');
            // 如果删除失败，重新渲染配置
            renderConfig();
        } finally {
            hideLoading();
        }
    };
    
    fieldDiv.appendChild(keyInput);
    fieldDiv.appendChild(valueInput);
    fieldDiv.appendChild(deleteBtn);
    
    container.appendChild(fieldDiv);
}

// 状态栏更新
function updateStatusBar(message = '') {
    const statusBar = document.getElementById('status-message');
    statusBar.textContent = message || '就绪';
}

// 模态框操作
function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    
    // 重置表单错误提示
    const form = modal.querySelector('form');
    if (form) {
        const errorElements = form.querySelectorAll('.error-message');
        errorElements.forEach(element => element.remove());
    }
    
    // 显示模态框
    modal.classList.add('active');
    
    // 针对不同模态框的特殊处理
    if (modalId === 'task-modal') {
        // 如果是任务表单且不是编辑模式（没有task_id），自动填充上一个任务的目录和分类
        const taskIdInput = form.querySelector('[name="task_id"]');
        if (!taskIdInput.value) {  // 确保是新增任务而不是编辑任务
            const tasks = state.tasks || [];
            if (tasks.length > 0) {
                const lastTask = tasks[tasks.length - 1];
                form.querySelector('[name="save_dir"]').value = lastTask.save_dir || '';
                form.querySelector('[name="category"]').value = lastTask.category || '';
            }
        }
        
        // 更新保存目录下拉列表
        updateSaveDirList();
        // 更新分类标签下拉列表
        updateCategoryList();
        // 更新定时规则下拉列表
        updateCronList();
    } else if (modalId === 'settings-modal') {
        // 更新设置表单
        updateSettingsForm();
    } else if (modalId === 'user-modal') {
        // 如果不是编辑模式，确保标题正确
        if (!form.dataset.mode || form.dataset.mode !== 'edit') {
            const modalTitle = modal.querySelector('.modal-header h2');
            if (modalTitle) {
                modalTitle.textContent = '添加用户';
            }
        }
    }
}

function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
        // 重置表单
        const form = modal.querySelector('form');
        if (form) {
            form.reset();
            // 清除隐藏的task_id
            const taskIdInput = form.querySelector('[name="task_id"]');
            if (taskIdInput) {
                taskIdInput.value = '';
            }
            
            // 如果是用户表单，清除编辑模式标记
            if (modalId === 'user-modal') {
                form.dataset.mode = '';
                form.dataset.originalUsername = '';
                
                // 重置标题
                const modalTitle = modal.querySelector('.modal-header h2');
                if (modalTitle) {
                    modalTitle.textContent = '添加用户';
                }
            }
        }
    }
}

// 任务操作
async function addTask(data) {
    try {
        // 确保分类字段被正确处理
        if (data.category === '') {
            delete data.category;  // 如果分类为空，删除该字段
        }
        
        const result = await callApi('task/add', 'POST', data);
        if (result.success) {
            await afterTaskOperation();
            hideModal('task-modal');
            showSuccess('任务添加成功');
        }
    } catch (error) {
        showError(error.message || '添加任务失败');
    }
}

// 添加日志相关函数
function appendLog(message, type = 'info', timestamp = null) {
    const logContainer = document.getElementById('progress-log');
    if (!logContainer) return;

    const timeStr = timestamp ? new Date(timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();
    const logEntry = document.createElement('div');
    logEntry.className = type;
    logEntry.innerHTML = `<span class="timestamp">[${timeStr}]</span> ${message}`;
    
    logContainer.appendChild(logEntry);
    logContainer.scrollTop = logContainer.scrollHeight;
}

function clearLog() {
    const logContainer = document.getElementById('progress-log');
    if (logContainer) {
        logContainer.innerHTML = '';
    }
}

// 修改任务执行函数
async function executeTask(taskId) {
    try {
        showLoading('正在执行任务...');
        const response = await callApi('/api/task/execute', 'POST', { task_id: taskId });
        
        if (response.success) {
            showNotification('任务开始执行', 'info');
            
            // 更新任务状态为运行中
            updateTaskStatus(taskId, 'running', '任务开始执行');
            
            // 将任务添加到正在运行的任务集合并开始状态轮询
            state.runningTasks.add(taskId);
            startTaskStatusPolling(taskId);
            
            return true;
        } else {
            showNotification(response.message || '执行任务失败', 'error');
            return false;
        }
    } catch (error) {
        console.error('执行任务失败:', error);
        showNotification('执行任务失败: ' + error.message, 'error');
        return false;
    } finally {
        hideLoading();
    }
}

async function editTask(taskId) {
    try {
        // 获取任务信息
        const task = findTaskById(taskId);
        if (!task) {
            throw new Error('任务不存在或已被删除');
        }
        
        // 获取表单和模态框
        const form = document.getElementById('task-form');
        const modal = document.getElementById('task-modal');
        
        if (!form || !modal) {
            throw new Error('界面初始化失败，请刷新页面');
        }
        
        // 填充表单数据
        form.querySelector('[name="task_id"]').value = task.id;
        form.querySelector('[name="name"]').value = task.name || '';
        
        // 组合URL和密码
        let fullUrl = task.url;
        if (task.pwd) {
            fullUrl += `?pwd=${task.pwd}`;
        }
        form.querySelector('[name="url"]').value = fullUrl;
        
        form.querySelector('[name="save_dir"]').value = task.save_dir || '';
        form.querySelector('[name="cron"]').value = task.cron || '';
        form.querySelector('[name="category"]').value = task.category || '';
        
        // 加载文件过滤配置
        if (task.file_filters) {
            // 显示过滤区域
            const filterSection = document.getElementById('filter-section');
            filterSection.style.display = 'block';
            const icon = document.querySelector('.toggle-header[onclick="toggleFilterSection()"] .toggle-icon');
            icon.textContent = 'expand_less';
            
            // 设置过滤类型
            const filterType = task.file_filters.type || 'include';
            const filterTypeInput = form.querySelector(`input[name="filter_type"][value="${filterType}"]`);
            if (filterTypeInput) {
                filterTypeInput.checked = true;
            }
            
            // 设置模式匹配
            if (task.file_filters.patterns && Array.isArray(task.file_filters.patterns)) {
                form.querySelector('[name="filter_patterns"]').value = task.file_filters.patterns.join(', ');
            }
            
            // 设置正则表达式
            if (task.file_filters.regex) {
                form.querySelector('[name="filter_regex"]').value = task.file_filters.regex;
            }
        }
        
        // 加载重命名配置
        if (task.rename_rules) {
            // 显示重命名区域
            const renameSection = document.getElementById('rename-section');
            renameSection.style.display = 'block';
            const icon = document.querySelector('.toggle-header[onclick="toggleRenameSection()"] .toggle-icon');
            icon.textContent = 'expand_less';
            
            // 设置重命名类型
            const renameType = task.rename_rules.type;
            if (renameType) {
                const renameTypeSelect = form.querySelector('[name="rename_type"]');
                renameTypeSelect.value = renameType;
                
                // 显示对应的字段
                updateRenameFields();
                
                // 设置具体规则
                const rules = task.rename_rules.rules || {};
                switch (renameType) {
                    case 'pattern':
                        form.querySelector('[name="rename_pattern"]').value = rules.pattern || '';
                        form.querySelector('[name="rename_replacement"]').value = rules.replacement || '';
                        break;
                    case 'prefix':
                        form.querySelector('[name="rename_prefix"]').value = rules.prefix || '';
                        break;
                    case 'suffix':
                        form.querySelector('[name="rename_suffix"]').value = rules.suffix || '';
                        break;
                    case 'exact':
                        if (rules.exact_match) {
                            form.querySelector('[name="rename_exact_match"]').value = JSON.stringify(rules.exact_match, null, 2);
                        }
                        break;
                }
            }
        }
        
        // 保存字段历史记录
        if (task.save_dir) saveFieldHistory('save_dir', task.save_dir);
        if (task.cron) saveFieldHistory('cron', task.cron);
        if (task.category) saveFieldHistory('category', task.category);
        
        // 显示模态框
        showModal('task-modal');
        
    } catch (error) {
        showError(error.message || '编辑任务失败');
    }
}

async function deleteTask(taskId) {
    if (!confirm('确定要删除这个任务吗？')) return;
    
    try {
        const response = await callApi('task/delete', 'POST', {
            task_id: taskId
        });
        
        if (response.success) {
            showSuccess('删除任务成功');
            await afterTaskOperation();
        } else {
            showError(response.message || '删除任务失败');
        }
    } catch (error) {
        showError('删除任务失败: ' + error.message);
    }
}

// 刷新任务列表
async function refreshTasks(retryCount = 3) {
    try {
        let result = await callApi('tasks');
        
        if (result.success) {
            state.tasks = result.tasks || [];
            
            // 如果存在排序字段，则按order排序
            if (state.tasks.length > 0 && 'order' in state.tasks[0]) {
                state.tasks.sort((a, b) => {
                    return (a.order || Infinity) - (b.order || Infinity);
                });
            }
            
            renderTasks();
            
            // 如果已经挂载了拖放排序，重新初始化
            if (window.taskListSortable) {
                window.taskListSortable.destroy();
                initDragAndDrop();
            }
            
            return state.tasks;
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        if (retryCount > 0) {
            console.warn(`刷新任务失败，正在重试，还剩 ${retryCount} 次机会`, error);
            await new Promise(resolve => setTimeout(resolve, 1000));
            return refreshTasks(retryCount - 1);
        } else {
            console.error('刷新任务失败:', error);
            showError('加载任务失败，请刷新页面');
            throw error;
        }
    }
    
    // 更新异常指示器
    updateErrorIndicator();
}

// 修改任务更新函数
async function updateTask(data) {
    if (this.isUpdating) return; // 防止重复提交
    this.isUpdating = true;
    
    try {
        // 获取原任务数据
        const tasks = state.tasks || [];
        const taskId = parseInt(data.task_id);
        const originalTask = tasks.find(t => t.order === taskId + 1);
        
        if (!originalTask) {
            console.error('找不到原始任务:', {
                taskId,
                availableOrders: tasks.map(t => t.order)
            });
            throw new Error('任务不存在');
        }
        
        // 处理URL和密码
        let url = data.url.trim();
        let pwd = '';
        
        // 从URL中提取密码
        if (url.includes('?pwd=')) {
            [url, pwd] = url.split('?pwd=');
            url = url.trim();
            pwd = pwd.trim();
        }
        
        // 创建完整的更新数据对象
        const updateData = {
            task_id: taskId,
            url: url,  // 使用处理后的URL
            save_dir: data.save_dir.trim(),
            pwd: pwd || data.pwd || originalTask.pwd || '',  // 优先使用新密码
            name: data.name.trim() || originalTask.name || '',
            category: data.category.trim() || originalTask.category || '',
            cron: data.cron.trim() || originalTask.cron || ''
        };
        
        console.log('准备更新任务:', {
            taskId,
            originalTask,
            updateData
        });
        
        // 发送更新请求
        const response = await callApi('task/update', 'POST', updateData);
        
        if (response.success) {
            // 验证更新是否成功
            const verifyResult = await verifyTaskUpdate(originalTask, updateData);
            if (!verifyResult.success) {
                throw new Error(verifyResult.error || '任务更新验证失败');
            }
            
            await afterTaskOperation();
            showSuccess('更新任务成功');
            hideModal('task-modal');
        } else {
            throw new Error(response.message || '更新任务失败');
        }
    } catch (error) {
        console.error('更新任务失败:', error);
        showError(error.message || '更新任务失败');
    } finally {
        this.isUpdating = false;
    }
}

// 添加任务更新验证函数
async function verifyTaskUpdate(originalTask, updateData) {
    try {
        // 重新获取任务列表
        const result = await callApi('tasks');
        if (!result.success) {
            return { success: false, error: '获取任务列表失败' };
        }
        
        // 查找更新后的任务
        const updatedTask = result.tasks.find(t => t.order === originalTask.order);
        
        if (!updatedTask) {
            return { 
                success: false, 
                error: '无法找到更新后的任务' 
            };
        }
        
        // 验证URL是否正确更新
        if (updatedTask.url !== updateData.url) {
            console.error('URL更新不匹配:', {
                expected: updateData.url,
                actual: updatedTask.url
            });
            return {
                success: false,
                error: 'URL更新验证失败'
            };
        }
        
        return { success: true };
    } catch (error) {
        return { 
            success: false, 
            error: error.message || '验证更新失败' 
        };
    }
}

// 用户操作
async function addUser(data) {
    try {
        const result = await callApi('user/add', 'POST', data);
        console.log('添加用户API响应:', result);
        
        // 刷新页面状态
        await initializeData();
        console.log('添加用户后刷新数据，当前用户列表:', state.users);
        
        // 如果是第一个用户，自动设为当前用户
        if (state.users.length === 1) {
            state.currentUser = state.users[0];
            updateLoginStatus(state.currentUser);
        }
        
        // 隐藏模态框和显示成功消息
        hideModal('user-modal');
        showSuccess('用户添加成功');
    } catch (error) {
        console.error('添加用户错误:', error);
        showError('添加用户失败');
    }
}

// 编辑用户
async function editUser(username) {
    try {
        showLoading('获取用户信息...');
        
        // 查找用户
        const user = state.users.find(u => u.username === username);
        if (!user) {
            throw new Error('用户不存在');
        }
        
        // 获取表单和模态框
        const form = document.getElementById('user-form');
        const modal = document.getElementById('user-modal');
        const modalTitle = modal.querySelector('.modal-header h2');
        
        if (!form || !modal) {
            throw new Error('界面初始化失败，请刷新页面');
        }
        
        // 设置编辑模式
        form.dataset.mode = 'edit';
        form.dataset.originalUsername = username;
        
        // 更改标题
        if (modalTitle) {
            modalTitle.textContent = '编辑用户';
        }
        
        // 填充表单数据
        form.querySelector('[name="username"]').value = user.username || '';
        
        // 调用API获取用户的cookies
        const result = await callApi(`user/${username}/cookies`, 'GET');
        if (result.success && result.cookies) {
            form.querySelector('[name="cookies"]').value = result.cookies;
        } else {
            form.querySelector('[name="cookies"]').value = '';
        }
        
        // 显示模态框
        showModal('user-modal');
    } catch (error) {
        showError(error.message || '获取用户信息失败');
    } finally {
        hideLoading();
    }
}

// 更新用户
async function updateUser(data) {
    try {
        const result = await callApi('user/update', 'POST', data);
        console.log('更新用户API响应:', result);
        
        // 刷新页面状态
        await initializeData();
        console.log('更新用户后刷新数据，当前用户列表:', state.users);
        
        // 隐藏模态框和显示成功消息
        hideModal('user-modal');
        showSuccess('用户更新成功');
    } catch (error) {
        console.error('更新用户错误:', error);
        showError('更新用户失败');
    }
}

async function switchUser(username) {
    try {
        showLoading('正在切换用户...');
        const response = await callApi('user/switch', 'POST', { username });
        
        if (response.success) {
            // 更新当前用户和登录状态
            state.currentUser = response.current_user;
            state.isLoggedIn = response.login_status;
            
            // 更新UI
            renderUsers();
            updateLoginStatus(response.current_user);
            
            showSuccess('切换用户成功');
            
            // 刷新任务列表
            await refreshTasks();
        } else {
            showError(response.message || '切换用户失败');
        }
    } catch (error) {
        showError('切换用户失败: ' + error.message);
    } finally {
        hideLoading();
    }
}

async function deleteUser(username) {
    if (!confirm('确定要删除此用户吗？此操作不可恢复。')) return;
    
    try {
        showLoading('正在删除用户...');
        await callApi('user/delete', 'POST', { username });
        
        // 更新用户列表
        state.users = state.users.filter(u => u.username !== username);
        if (state.currentUser && state.currentUser.username === username) {
            state.currentUser = null;
        }
        
        // 更新UI
        renderUsers();
        updateLoginStatus(state.currentUser);
        
        showSuccess('用户删除成功');
    } catch (error) {
        showError(error.message || '删除用户失败');
    } finally {
        hideLoading();
    }
}

// 配置保存
async function saveConfig() {
    // 防止重复提交
    const saveBtn = document.getElementById('save-settings-btn');
    if (saveBtn.disabled) return;
    
    showLoading('正在保存配置...');
    try {
        // 禁用保存按钮
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="material-icons">hourglass_empty</i> 保存中...';
        
        const notifyEnabled = document.getElementById('notify-enabled').checked;
        const globalCron = document.getElementById('global-cron').value.trim();
        
        // 收集所有通知字段
        const directFields = {};
        const notifyFieldElements = document.querySelectorAll('.notify-field');
        notifyFieldElements.forEach(field => {
            const key = field.querySelector('.field-name').value;
            const value = field.querySelector('.field-value').value.trim();
            if (key && value) {
                directFields[key] = value;
            }
        });
        
        // 处理定时规则
        const cronRules = globalCron.split(';')
            .map(rule => rule.trim())
            .filter(rule => rule.length > 0);
            
        console.log('处理后的定时规则:', cronRules);
        console.log('收集到的通知字段:', directFields);
        
        const config = {
            notify: {
                enabled: notifyEnabled,
                direct_fields: directFields
            },
            cron: {
                default_schedule: cronRules,
                auto_install: true
            }
        };
        
        console.log('准备发送的配置对象:', config);
        
        // 使用 config/update API，它会自动重启调度器
        const result = await callApi('config/update', 'POST', config);
        console.log('配置保存结果:', result);
        
        if (result.success) {
            // 更新本地状态
            state.config = {
                ...state.config,
                ...config
            };
            console.log('更新后的状态:', state.config);
            showSuccess('配置已保存并更新调度器');
        } else {
            throw new Error(result.message || '保存配置失败');
        }
    } catch (error) {
        console.error('保存配置失败:', error);
        showError(error.message || '保存配置失败');
    } finally {
        // 恢复按钮状态
        saveBtn.disabled = false;
        saveBtn.innerHTML = '保存设置';
        hideLoading();
    }
}

async function testNotify() {
    try {
        await callApi('notify/test', 'POST');
        showSuccess('测试通知已发送');
    } catch (error) {
        showError('发送测试通知失败');
    }
}

// 获取状态显示文本
function getStatusText(status) {
    const statusMap = {
        'normal': '正常',
        'running': '运行中',
        'error': '错误',
        'pending': '等待中',
        'skipped': '已跳过',
        'success': '成功'
    };
    return statusMap[status] || status;
}

function showSuccess(message) {
    showNotification(message, 'success');
}

function showError(message) {
    showNotification(message, 'error');
}

// 事件监听器
document.addEventListener('DOMContentLoaded', initializeApp);

// 处理任务表单提交
async function handleTaskSubmit(event) {
    event.preventDefault();
    
    const form = event.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    
    // 添加防重复提交逻辑
    if (submitBtn.disabled) return;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="material-icons">hourglass_empty</i> 提交中...';

    try {
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());
        
        // 处理URL和提取码
        const urlData = parseShareUrl(data.url);
        data.url = urlData.url;
        if (urlData.pwd) {
            data.pwd = urlData.pwd;
        }
        
        // 确保目录以/开头
        if (!data.save_dir.startsWith('/')) {
            data.save_dir = '/' + data.save_dir;
        }
        
        // 构建文件过滤配置
        const fileFilters = buildFileFiltersConfig();
        if (fileFilters) {
            data.file_filters = fileFilters;
        }
        
        // 构建重命名规则配置
        const renameRules = buildRenameRulesConfig();
        if (renameRules) {
            data.rename_rules = renameRules;
        }
        
        // 保存字段历史记录
        saveFieldHistory('save_dir', data.save_dir);
        if (data.cron) saveFieldHistory('cron', data.cron);
        if (data.category) saveFieldHistory('category', data.category);
        
        // 如果有task_id，说明是编辑任务
        if (data.task_id) {
            await updateTask(data);
        } else {
            // 新增任务
            await addTask({
                url: data.url,
                pwd: data.pwd,
                save_dir: data.save_dir,
                name: data.name || '',
                cron: data.cron || '',
                category: data.category || '',
                file_filters: data.file_filters,
                rename_rules: data.rename_rules
            });
        }
        
        // 更新所有下拉列表
        updateSaveDirList();
        updateCategoryList();
        updateCronList();
    } catch (error) {
        showError(error.message || '操作失败');
    } finally {
        // 恢复按钮状态
        submitBtn.disabled = false;
        submitBtn.innerHTML = '保存';
    }
}

// 解析分享链接
function parseShareUrl(url) {
    const result = {
        url: url,
        pwd: null
    };
    
    try {
        const urlObj = new URL(url);
        const pwd = urlObj.searchParams.get('pwd');
        if (pwd) {
            result.pwd = pwd;
            // 移除pwd参数
            urlObj.searchParams.delete('pwd');
            result.url = urlObj.toString();
        }
    } catch (error) {
        console.warn('解析URL失败:', error);
    }
    
    return result;
}

// 添加更新分类列表的函数
function updateCategoryList() {
    // 从任务中提取所有已使用的分类
    state.categories.clear();
    if (Array.isArray(state.tasks)) {
        state.tasks.forEach(task => {
            if (task.category) {
                state.categories.add(task.category);
            }
        });
    }
    
    // 获取历史记录
    const history = getFieldHistory('category');
    history.forEach(category => state.categories.add(category));
    
    // 转换为排序后的数组
    const sortedCategories = Array.from(state.categories).sort();
    
    // 更新datalist
    const categoryList = document.getElementById('category-list');
    if (categoryList) {
        categoryList.innerHTML = '';
        // 添加"未分类"选项
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = '未分类';
        categoryList.appendChild(defaultOption);
        
        // 添加已存在的分类
        sortedCategories.forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            categoryList.appendChild(option);
        });
    }
    
    // 更新自定义下拉列表
    const dropdown = document.getElementById('category-dropdown');
    if (dropdown) {
        dropdown.innerHTML = '';
        
        // 添加"未分类"选项
        const defaultItem = document.createElement('div');
        defaultItem.className = 'dropdown-item';
        defaultItem.textContent = '未分类';
        defaultItem.onclick = () => {
            const input = document.querySelector('input[name="category"]');
            if (input) {
                input.value = '';
            }
            hideDropdown('category-dropdown');
        };
        dropdown.appendChild(defaultItem);
        
        // 如果没有分类，添加提示
        if (sortedCategories.length === 0) {
            const item = document.createElement('div');
            item.className = 'dropdown-item';
            item.style.fontStyle = 'italic';
            item.textContent = '暂无其他分类';
            dropdown.appendChild(item);
        } else {
            // 添加已存在的分类
            sortedCategories.forEach(category => {
                const item = document.createElement('div');
                item.className = 'dropdown-item';
                item.textContent = category;
                item.onclick = () => {
                    const input = document.querySelector('input[name="category"]');
                    if (input) {
                        input.value = category;
                    }
                    hideDropdown('category-dropdown');
                };
                dropdown.appendChild(item);
            });
        }
    }
}

// 在main.js中添加获取分类的函数
async function fetchCategories() {
    try {
        const result = await callApi('categories');
        if (result.success) {
            // 更新分类按钮
            updateCategoryButtons(result.categories);
        }
    } catch (error) {
        console.error('获取分类失败:', error);
    }
}

// 更新分类按钮的函数
function updateCategoryButtons(categories = []) {
    const categoryFilter = document.querySelector('.category-filter');
    if (!categoryFilter) return;

    // 保存当前选中的分类
    const currentCategory = document.querySelector('.category-btn.active')?.dataset.category || 'all';

    // 如果没有传入categories参数，从state中获取
    if (!categories || !Array.isArray(categories)) {
        categories = Array.from(state.categories || []);
    }

    // 清空现有按钮
    categoryFilter.innerHTML = '';
    
    // 添加"全部分类"按钮
    const allButton = document.createElement('button');
    allButton.className = 'category-btn' + (currentCategory === 'all' ? ' active' : '');
    allButton.setAttribute('data-category', 'all');
    allButton.textContent = '全部分类';
    allButton.onclick = () => filterByCategory('all');
    categoryFilter.appendChild(allButton);
    
    // 添加"未分类"按钮
    const uncategorizedButton = document.createElement('button');
    uncategorizedButton.className = 'category-btn' + (currentCategory === 'uncategorized' ? ' active' : '');
    uncategorizedButton.setAttribute('data-category', 'uncategorized');
    uncategorizedButton.textContent = '未分类';
    uncategorizedButton.onclick = () => filterByCategory('uncategorized');
    categoryFilter.appendChild(uncategorizedButton);

    // 添加所有分类按钮
    categories.forEach(category => {
        if (category) {  // 只添加非空分类
            const button = document.createElement('button');
            button.className = 'category-btn' + (currentCategory === category ? ' active' : '');
            button.setAttribute('data-category', category);
            button.textContent = category;
            button.onclick = () => filterByCategory(category);
            categoryFilter.appendChild(button);
        }
    });

    // 如果当前没有找到选中的分类按钮，默认选中"全部分类"
    if (!document.querySelector('.category-btn.active')) {
        allButton.classList.add('active');
    }

    // 重新应用过滤器
    filterTasks();
}

// 在初始化数据时调用获取分类
async function initializeData() {
    try {
        // 显示加载中提示
        showLoading('正在加载数据...');
        
        // 1. 获取任务列表
        const tasksResponse = await callApi('tasks', 'GET');
        if (tasksResponse.success) {
            // 按order排序
            state.tasks = tasksResponse.tasks.sort((a, b) => (a.order || Infinity) - (b.order || Infinity));
            // 渲染任务列表
            renderTasks();
        } else {
            showError(tasksResponse.message || '获取任务列表失败');
        }
        
        // 2. 获取用户列表
        const usersResponse = await callApi('users', 'GET');
        if (usersResponse.success) {
            state.users = usersResponse.users;
            // 更新当前用户
            if (usersResponse.current_user) {
                state.currentUser = state.users.find(u => u.username === usersResponse.current_user);
            }
            // 渲染用户列表
            renderUsers();
        } else {
            showError(usersResponse.message || '获取用户列表失败');
        }
        
        // 3. 获取系统配置
        const configResponse = await callApi('config', 'GET');
        if (configResponse.success) {
            state.config = configResponse.config;
            // 使用完整的用户信息
            if (configResponse.config.baidu.current_user) {
                state.currentUser = configResponse.config.baidu.current_user;
                state.isLoggedIn = true;
            } else {
                state.currentUser = null;
                state.isLoggedIn = false;
            }
            // 渲染配置
            renderConfig();
            // 更新登录状态显示
            updateLoginStatus(state.currentUser);
        } else {
            showError(configResponse.message || '获取系统配置失败');
        }
        
        // 4. 获取分类列表
        await refreshCategories();
        
        // 5. 更新下拉列表
        updateCategoryList();
        updateSaveDirList();
        updateCronList();
        
        // 隐藏加载中提示
        hideLoading();
        
        return true;
    } catch (error) {
        hideLoading();
        showError('初始化数据失败: ' + error.message);
        return false;
    }
}

// 在main.js中添加分类过滤函数
function filterByCategory(category) {
    // 更新按钮状态
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.category === category);
    });

    // 过滤任务
    filterTasks();
}

// 任务筛选函数
function filterTasks() {
    const selectedStatus = document.querySelector('.status-btn.active').dataset.status;
    const selectedCategory = document.querySelector('.category-btn.active').dataset.category;
    
    document.querySelectorAll('.task-item').forEach(task => {
        const statusMatch = selectedStatus === 'all' || task.dataset.status === selectedStatus;
        let categoryMatch = false;
        
        if (selectedCategory === 'all') {
            categoryMatch = true;
        } else if (selectedCategory === 'uncategorized') {
            categoryMatch = !task.dataset.category || task.dataset.category === '';
        } else {
            categoryMatch = task.dataset.category === selectedCategory;
        }
        
        task.style.display = statusMatch && categoryMatch ? 'flex' : 'none';
    });
    
    // 更新异常指示器
    updateErrorIndicator();
}

// 在任务状态更改后更新分类
async function refreshCategories() {
    try {
        // 获取最新的分类列表
        const result = await callApi('categories');
        if (result.success) {
            // 更新state中的分类
            state.categories = new Set(result.categories || []);
            // 更新分类按钮
            updateCategoryButtons(result.categories);
        }
    } catch (error) {
        console.error('更新分类失败:', error);
        showError('更新分类失败，请刷新页面');
    }
}

// 在任务添加、更新或删除后调用
async function afterTaskOperation() {
    try {
        // 刷新任务列表
        await refreshTasks();

        // 刷新分类
        await refreshCategories();

        // 更新列表
        updateCategoryList();
        updateSaveDirList();
        updateCronList();

        // 重新绑定事件
        bindTaskEvents();
        
        // 更新异常指示器
        updateErrorIndicator();

    } catch (error) {
        console.error('任务操作后刷新失败:', error);
    }
}

// 处理任务日志
function handleTaskLog(data) {
    const { message, type, timestamp } = data;
    
    // 如果进度窗口打开，则显示日志
    const progressModal = document.getElementById('progress-modal');
    if (progressModal && progressModal.classList.contains('active')) {
        appendLog(message, type, timestamp);
    }
    
    // 同时在状态栏显示消息
    if (type === 'error') {
        showError(message);
    } else if (type === 'success') {
        showSuccess(message);
    }
}

// 处理状态更新
function handleStatusUpdate(data) {
    const { is_running, current_user } = data;
    
    // 更新运行状态
    if (typeof is_running === 'boolean') {
        const statusElement = document.getElementById('scheduler-status');
        if (statusElement) {
            statusElement.className = is_running ? 'status running' : 'status stopped';
            statusElement.textContent = is_running ? '运行中' : '已停止';
        }
    }
    
    // 更新当前用户
    if (current_user) {
        // 从用户列表中查找完整的用户信息
        const userInfo = state.users?.find(u => u.username === current_user || u.name === current_user);
        if (userInfo) {
            state.currentUser = userInfo;
            updateLoginStatus(userInfo);
        } else {
            // 如果在用户列表中找不到，至少显示用户名
            updateLoginStatus({ username: current_user, name: current_user });
        }
    }
    
    // 更新异常指示器
    updateErrorIndicator();
}

// 处理用户表单提交
async function handleUserSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    
    try {
        // 显示加载状态
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="material-icons">hourglass_empty</i> 保存中...';
        
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());
        
        // 判断是添加模式还是编辑模式
        const isEditMode = form.dataset.mode === 'edit';
        const originalUsername = form.dataset.originalUsername;
        
        if (isEditMode) {
            // 编辑用户
            await updateUser({
                original_username: originalUsername,
                username: data.username,
                cookies: data.cookies
            });
        } else {
            // 添加用户
            await addUser(data);
        }
        
        // 清除编辑模式标记
        form.dataset.mode = '';
        form.dataset.originalUsername = '';
        
        // 重置标题
        const modalTitle = document.querySelector('#user-modal .modal-header h2');
        if (modalTitle) {
            modalTitle.textContent = '添加用户';
        }
    } catch (error) {
        // 不需要在这里显示错误，因为addUser会处理
        console.error('用户操作错误:', error);
    } finally {
        // 恢复按钮状态
        submitBtn.disabled = false;
        submitBtn.innerHTML = '保存';
    }
}

// 检查应用更新
async function checkForUpdates() {
    try {
        // 通过后端API获取版本信息
        const response = await callApi('version/check');
        if (!response.success) {
            console.warn('无法获取最新版本信息:', response.message);
            return;
        }
        
        // 规范化版本号（移除 'v' 前缀并分割为数组）
        const normalizeVersion = (version) => {
            return version.replace(/^v/, '').split('.').map(Number);
        };
        
        // 比较版本号
        const compareVersions = (v1, v2) => {
            const v1Parts = normalizeVersion(v1);
            const v2Parts = normalizeVersion(v2);
            
            for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
                const v1Part = v1Parts[i] || 0;
                const v2Part = v2Parts[i] || 0;
                if (v1Part > v2Part) return 1;
                if (v1Part < v2Part) return -1;
            }
            return 0;
        };
        
        const latestVersion = response.version;
        console.log(`检查版本：当前 ${APP_VERSION} 最新 ${latestVersion}`);
        
        // 只有当最新版本号大于当前版本号时才显示更新提示
        if (latestVersion && compareVersions(latestVersion, APP_VERSION) > 0) {
            // 显示更新指示器
            const updateIndicator = document.getElementById('update-indicator');
            if (updateIndicator) {
                updateIndicator.classList.add('active');
                
                // 添加点击事件，点击后导航到发布页面
                const versionContainer = document.querySelector('.version-container');
                if (versionContainer) {
                    versionContainer.style.cursor = 'pointer';
                    versionContainer.title = `发现新版本 ${latestVersion}，点击查看更新`;
                    versionContainer.addEventListener('click', () => {
                        window.open(`https://github.com/${GITHUB_REPO}/releases/latest`, '_blank');
                    });
                }
            }
        } else {
            // 如果不需要更新，确保移除更新指示器
            const updateIndicator = document.getElementById('update-indicator');
            if (updateIndicator) {
                updateIndicator.classList.remove('active');
            }
        }
    } catch (error) {
        console.error('检查更新失败:', error);
    }
}

// 应用初始化
async function initializeApp() {
    try {
        // 设置版本号
        document.getElementById('app-version').textContent = APP_VERSION;
        
        // 检查登录状态
        await checkLoginStatus();
        
        if (state.isLoggedIn) {
            // 加载初始数据
            await initializeData();
            
            // 初始化事件监听器
            initializeEventListeners();
            
            // 开启拖拽功能
            initDragAndDrop();
            
            // 初始化移动端事件
            initMobileEvents();
            
            // 检查是否有更新
            // 初始化导航
            initNavigation();
            
            // 添加任务状态轮询
            startTaskPolling();
        }
    } catch (error) {
        console.error('初始化应用失败:', error);
        showNotification('初始化应用失败: ' + error.message, 'error');
    }
}

// 初始化事件监听器
function initializeEventListeners() {
    // 导航按钮点击事件处理
    initNavigation();
    
    const taskForm = document.getElementById('task-form');
    const userForm = document.getElementById('user-form');
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    const testNotifyBtn = document.getElementById('test-notify-btn');
    const addNotifyFieldBtn = document.getElementById('add-notify-field');
    const addPushplusTokenBtn = document.getElementById('add-pushplus-token-btn');
    const addPushplusUserBtn = document.getElementById('add-pushplus-user-btn');
    const addBarkBtn = document.getElementById('add-bark-btn');
    
    // 任务搜索
    const searchInput = document.querySelector('.search-input');
    if (searchInput) {
        // 同时监听 input 和 change 事件
        ['input', 'change'].forEach(eventType => {
            searchInput.addEventListener(eventType, (e) => {
                const keyword = e.target.value.toLowerCase();
                const tasks = document.querySelectorAll('.task-item');
                
                tasks.forEach(task => {
                    const taskName = task.querySelector('.task-name')?.textContent.toLowerCase() || '';
                    const saveDir = task.querySelector('.save-dir')?.textContent.toLowerCase() || '';
                    const shouldShow = taskName.includes(keyword) || saveDir.includes(keyword);
                    task.style.display = shouldShow ? 'flex' : 'none';
                });
            });
        });
    }
    
    // 任务表单提交
    if (taskForm) {
        taskForm.addEventListener('submit', handleTaskSubmit);
    }
    
    // 用户表单提交
    if (userForm) {
        userForm.addEventListener('submit', handleUserSubmit);
    }
    
    // 配置保存按钮
    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', saveConfig);
    }
    
    // 测试通知按钮
    if (testNotifyBtn) {
        testNotifyBtn.addEventListener('click', async () => {
            try {
                showLoading('发送测试通知...');
                await testNotify();
            } catch (error) {
                showError(error.message || '发送测试通知失败');
            } finally {
                hideLoading();
            }
        });
    }
    
    // 添加通知字段按钮
    if (addNotifyFieldBtn) {
        addNotifyFieldBtn.addEventListener('click', () => {
            const keyInput = document.getElementById('new-notify-key');
            const valueInput = document.getElementById('new-notify-value');
            
            const key = keyInput.value.trim();
            const value = valueInput.value.trim();
            
            if (!key) {
                showError('字段名称不能为空');
                return;
            }
            
            // 检查字段是否已存在
            const existingField = document.querySelector(`.notify-field[data-key="${key}"]`);
            if (existingField) {
                showError(`字段 ${key} 已存在`);
                return;
            }
            
            // 添加到界面
            addNotifyFieldToUI(key, value);
            
            // 清空输入框
            keyInput.value = '';
            valueInput.value = '';
            keyInput.focus();
            
            showSuccess(`添加通知字段 ${key} 成功`);
        });
    }
    
    // 快速添加PUSH_PLUS_TOKEN按钮
    if (addPushplusTokenBtn) {
        addPushplusTokenBtn.addEventListener('click', () => {
            // 检查是否已存在
            const tokenField = document.querySelector('.notify-field[data-key="PUSH_PLUS_TOKEN"]');
            
            if (!tokenField) {
                addNotifyFieldToUI('PUSH_PLUS_TOKEN', '');
                showSuccess('已添加PUSH_PLUS_TOKEN字段');
            } else {
                showError('PUSH_PLUS_TOKEN字段已存在');
            }
        });
    }
    
    // 快速添加PUSH_PLUS_USER按钮
    if (addPushplusUserBtn) {
        addPushplusUserBtn.addEventListener('click', () => {
            // 检查是否已存在
            const userField = document.querySelector('.notify-field[data-key="PUSH_PLUS_USER"]');
            
            if (!userField) {
                addNotifyFieldToUI('PUSH_PLUS_USER', '');
                showSuccess('已添加PUSH_PLUS_USER字段');
            } else {
                showError('PUSH_PLUS_USER字段已存在');
            }
        });
    }
    
    // 快速添加Bark按钮
    if (addBarkBtn) {
        addBarkBtn.addEventListener('click', () => {
            // 检查是否已存在
            const barkField = document.querySelector('.notify-field[data-key="BARK_PUSH"]');
            
            if (!barkField) {
                addNotifyFieldToUI('BARK_PUSH', '');
                showSuccess('已添加BARK_PUSH字段');
            } else {
                showError('BARK_PUSH字段已存在');
            }
        });
    }
    
    // 登录凭据更新按钮
    const updateAuthBtn = document.getElementById('update-auth-btn');
    if (updateAuthBtn) {
        updateAuthBtn.addEventListener('click', async () => {
            const newUsername = document.getElementById('new-username').value.trim();
            const oldPassword = document.getElementById('old-password').value.trim();
            const newPassword = document.getElementById('new-password').value.trim();
            const confirmPassword = document.getElementById('confirm-password').value.trim();
            
            if (!newUsername || !oldPassword || !newPassword || !confirmPassword) {
                showError('所有字段都必须填写');
                return;
            }
            
            if (newPassword !== confirmPassword) {
                showError('两次输入的密码不一致');
                return;
            }
            
            try {
                showLoading('更新登录凭据...');
                await updateAuth({
                    username: newUsername,
                    password: newPassword,
                    old_password: oldPassword
                });
                
                // 清空表单
                document.getElementById('new-username').value = '';
                document.getElementById('old-password').value = '';
                document.getElementById('new-password').value = '';
                document.getElementById('confirm-password').value = '';
                
                showSuccess('登录凭据已更新，请使用新凭据重新登录');
                
                // 3秒后退出登录
                setTimeout(() => {
                    logout();
                }, 3000);
            } catch (error) {
                showError(error.message || '更新登录凭据失败');
            } finally {
                hideLoading();
            }
        });
    }
    
    // 添加任务按钮
    const addTaskBtn = document.getElementById('add-task-btn');
    if (addTaskBtn) {
        addTaskBtn.addEventListener('click', () => {
            // 清空表单
            const form = document.getElementById('task-form');
            if (form) {
                form.reset();
                form.elements['task_id'].value = '';
            }
            
            // 显示模态框
            showModal('task-modal');
        });
    }
    
    // 添加用户按钮
    const addUserBtn = document.getElementById('add-user-btn');
    if (addUserBtn) {
        addUserBtn.addEventListener('click', () => {
            // 清空表单
            const form = document.getElementById('user-form');
            if (form) form.reset();
            
            // 显示模态框
            showModal('user-modal');
        });
    }
    
    // 状态筛选按钮
    document.querySelectorAll('.status-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.status-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            filterTasks();
        });
    });
    
    // 分类筛选
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const category = btn.dataset.category;
            filterByCategory(category);
        });
    });

    // 初始化拖拽功能
    initDragAndDrop();
}

// 更新登录状态显示
function updateLoginStatus(user) {
    const currentUserElement = document.getElementById('current-user');
    if (!currentUserElement) {
        console.warn('未找到current-user元素');
        return;
    }
    
    console.log('更新登录状态:', {
        user,
        elementFound: !!currentUserElement,
        previousState: currentUserElement.className,
        previousText: currentUserElement.textContent,
        isLoggedIn: state.isLoggedIn
    });
    
    if (user && state.isLoggedIn) {
        const displayName = user.name || user.username;
        currentUserElement.innerHTML = `<span class="user-name">${displayName}</span>`;
        currentUserElement.classList.add('logged-in');
        currentUserElement.title = `当前用户: ${displayName}`;
        console.log('用户已登录:', {
            displayName,
            fullUserInfo: user
        });
    } else {
        currentUserElement.innerHTML = '未登录';
        currentUserElement.classList.remove('logged-in');
        currentUserElement.title = '未登录';
        console.log('用户未登录');
    }
}

// 检查登录状态
async function checkLoginStatus() {
    try {
        const response = await fetch('/api/config');
        if (response.status === 401 || response.redirected) {
            // 未登录或会话过期，重定向到登录页
            state.isLoggedIn = false;
            clearInterval(state.sessionCheckInterval); // 清除定时器
            window.location.href = '/login';
            return;
        }
        
        const result = await response.json();
        if (result.success) {
            state.isLoggedIn = true;
            state.currentUser = result.config.baidu.current_user;
            updateLoginStatus(state.currentUser);
        } else {
            state.isLoggedIn = false;
            updateLoginStatus(null);
            window.location.href = '/login';
        }
    } catch (error) {
        console.error('检查登录状态失败:', error);
        state.isLoggedIn = false;
        updateLoginStatus(null);
        window.location.href = '/login';
    }
}

// 启动定期检查会话状态
function startSessionCheck() {
    // 清除可能存在的旧定时器
    if (state.sessionCheckInterval) {
        clearInterval(state.sessionCheckInterval);
    }
    
    // 每分钟检查一次会话状态
    state.sessionCheckInterval = setInterval(checkLoginStatus, 60000);
}

// 在页面加载和初始化数据时检查登录状态
document.addEventListener('DOMContentLoaded', function() {
    checkLoginStatus();
    startSessionCheck(); // 启动定期检查
});

// 添加登出功能
function logout() {
    // 清除定时器
    if (state.sessionCheckInterval) {
        clearInterval(state.sessionCheckInterval);
    }
    window.location.href = '/logout';
}

// 批量操作功能
let selectedTasks = new Set();

function selectAllTasks() {
    const allCheckboxes = document.querySelectorAll('.task-item .checkbox-input');
    const shouldSelect = selectedTasks.size !== document.querySelectorAll('.task-item').length;
    
    selectedTasks.clear();
    if (shouldSelect) {
        // 全选 - 只选择当前可见的任务
        document.querySelectorAll('.task-item').forEach(item => {
            if (item.style.display !== 'none') {
                const taskId = parseInt(item.dataset.taskId);
                if (!isNaN(taskId)) {
                    selectedTasks.add(taskId);
                }
            }
        });
    }
    
    // 更新复选框状态
    allCheckboxes.forEach(checkbox => {
        const taskItem = checkbox.closest('.task-item');
        if (taskItem) {
            const taskId = parseInt(taskItem.dataset.taskId);
            checkbox.checked = selectedTasks.has(taskId);
        }
    });
    
    // 更新UI状态
    updateBatchOperationUI();
}

function toggleTaskSelection(taskId) {
    if (typeof taskId !== 'number' || isNaN(taskId)) {
        console.error('Invalid taskId:', taskId);
        return;
    }
    
    const taskItem = document.querySelector(`.task-item[data-task-id="${taskId}"]`);
    if (!taskItem) {
        console.error('Task element not found:', taskId);
        return;
    }
    
    const checkbox = taskItem.querySelector('.checkbox-input');
    
    if (selectedTasks.has(taskId)) {
        selectedTasks.delete(taskId);
        if (checkbox) checkbox.checked = false;
    } else {
        selectedTasks.add(taskId);
        if (checkbox) checkbox.checked = true;
    }
    
    updateBatchOperationUI();
}

function updateBatchOperationUI() {
    const selectedCount = selectedTasks.size;
    
    // 更新按钮状态
    const batchButtons = document.querySelectorAll('[onclick^="executeBatchOperation"]');
    batchButtons.forEach(btn => {
        btn.disabled = selectedCount === 0;
    });
    
    // 更新任务项的选中状态
    document.querySelectorAll('.task-item').forEach(item => {
        const taskId = parseInt(item.dataset.taskId);
        if (!isNaN(taskId)) {
            const checkbox = item.querySelector('.checkbox-input');
            item.classList.toggle('selected', selectedTasks.has(taskId));
            if (checkbox) {
                checkbox.checked = selectedTasks.has(taskId);
            }
        }
    });
    
    // 更新选中数量显示
    const countElement = document.querySelector('.selected-count');
    if (countElement) {
        countElement.textContent = selectedCount > 0 ? `已选择 ${selectedCount} 项` : '';
    }
}

// 批量操作执行
async function executeBatchOperation(operation) {
    const selectedTaskIds = Array.from(selectedTasks);
    if (!selectedTaskIds.length) {
        showError('请先选择要操作的任务');
        return;
    }

    try {
        let response;
        switch (operation) {
            case 'execute':
                if (!confirm(`确定要执行选中的 ${selectedTaskIds.length} 个任务吗？`)) return;
                
                // 清空并显示日志窗口
                clearLog();
                showModal('progress-modal');
                appendLog('开始批量执行任务...', 'info');
                appendLog(`选中的任务数量: ${selectedTaskIds.length}`, 'info');
                
                // 显示选中的任务列表
                const selectedTasks = state.tasks.filter(task => selectedTaskIds.includes(task.order - 1));
                selectedTasks.forEach(task => {
                    appendLog(`\n任务信息:`, 'info');
                    appendLog(`名称: ${task.name || task.url}`, 'info');
                    appendLog(`分享链接: ${task.url}`, 'info');
                    appendLog(`保存目录: ${task.save_dir}`, 'info');
                    if (task.pwd) {
                        appendLog(`提取码: ${task.pwd}`, 'info');
                    }
                });
                
                response = await callApi('tasks/execute-all', 'POST', {
                    task_ids: selectedTaskIds
                }, false);
                
                if (response.success) {
                    // 显示执行结果
                    if (response.results) {
                        const { success, skipped, failed } = response.results;
                        
                        if (success.length > 0) {
                            appendLog('\n成功执行的任务:', 'success');
                            success.forEach(task => {
                                appendLog(`- ${task.name || task.url}`, 'success');
                                // 显示转存的文件
                                const files = response.results.transferred_files[task.url];
                                if (files && files.length > 0) {
                                    appendLog('  转存的文件:', 'info');
                                    files.forEach(file => {
                                        appendLog(`  - ${file}`, 'info');
                                    });
                                }
                            });
                        }
                        
                        if (skipped.length > 0) {
                            appendLog('\n跳过的任务:', 'warning');
                            skipped.forEach(task => {
                                appendLog(`- ${task.name || task.url} (没有新文件需要转存)`, 'warning');
                            });
                        }
                        
                        if (failed.length > 0) {
                            appendLog('\n失败的任务:', 'error');
                            failed.forEach(task => {
                                appendLog(`- ${task.name || task.url}`, 'error');
                            });
                        }
                    }
                    
                    appendLog(`\n执行结果: ${response.message}`, 'success');
                    showSuccess(response.message);
                } else {
                    appendLog(`\n执行失败: ${response.message}`, 'error');
                    showError(response.message);
                }
                break;
                
            case 'delete':
                if (!confirm(`确定要删除选中的 ${selectedTaskIds.length} 个任务吗？`)) return;
                response = await callApi('tasks/batch-delete', 'POST', {
                    task_ids: selectedTaskIds
                });
                break;
                
            default:
                showError('不支持的操作类型');
                return;
        }

        if (response.success) {
            await afterTaskOperation();
            showSuccess(response.message || `批量${operation === 'execute' ? '执行' : '删除'}成功`);
            // 清除选中状态
            selectedTasks.clear();
            updateBatchOperationUI();
        } else {
            throw new Error(response.message);
        }
    } catch (error) {
        showError(error.message || `批量${operation === 'execute' ? '执行' : '删除'}失败`);
    }
}

// 初始化拖拽排序
function initDragAndDrop() {
    const taskList = document.querySelector('.task-list');
    if (!taskList) return;
    
    new Sortable(taskList, {
        animation: 150,
        handle: '.drag-handle',
        ghostClass: 'task-ghost',
        chosenClass: 'task-chosen',
        dragClass: 'task-drag',
        onEnd: async function(evt) {
            const taskId = parseInt(evt.item.dataset.taskId);
            
            try {
                const response = await callApi('task/reorder', 'POST', {
                    task_id: taskId,
                    new_order: evt.newIndex + 1
                });
                
                if (response.success) {
                    await refreshTasks();
                }
            } catch (error) {
                showError(error.message || '任务排序失败');
                // 恢复原始顺序
                await refreshTasks();
            }
        }
    });
}

// 导航按钮点击事件处理
function initNavigation() {
    const navBtns = document.querySelectorAll('.nav-btn');
    const panels = document.querySelectorAll('.panel');
    
    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetPanel = btn.dataset.panel;
            
            // 更新按钮状态
            navBtns.forEach(b => b.classList.remove('active'));
            document.querySelectorAll(`.nav-btn[data-panel="${targetPanel}"]`).forEach(b => {
                b.classList.add('active');
            });
            
            // 更新面板显示
            panels.forEach(panel => {
                panel.classList.remove('active');
                if (panel.id === `${targetPanel}-panel`) {
                    panel.classList.add('active');
                }
            });
        });
    });
}

// 添加登录状态检查
function checkLoginStatus() {
    // 检查是否存在登录会话
    fetch('/api/config')
        .then(response => {
            if (response.status === 401 || response.redirected) {
                // 未登录或会话过期,重定向到登录页
                window.location.href = '/login';
            }
        })
        .catch(error => {
            console.error('检查登录状态失败:', error);
            window.location.href = '/login';
        });
}

// 在页面加载时检查登录状态
document.addEventListener('DOMContentLoaded', function() {
    checkLoginStatus();
});

// 更新保存目录下拉列表
function updateSaveDirList() {
    // 从任务中提取所有已使用的保存目录
    const saveDirs = new Set();
    if (Array.isArray(state.tasks)) {
        state.tasks.forEach(task => {
            if (task.save_dir) {
                saveDirs.add(task.save_dir);
            }
        });
    }
    
    // 获取历史记录
    const history = getFieldHistory('save_dir');
    history.forEach(dir => saveDirs.add(dir));
    
    // 转换为排序后的数组
    const sortedDirs = Array.from(saveDirs).sort();
    
    // 更新datalist
    const saveDirList = document.getElementById('save-dir-list');
    if (saveDirList) {
        saveDirList.innerHTML = '';
        
        // 添加已存在的保存目录
        sortedDirs.forEach(dir => {
            const option = document.createElement('option');
            option.value = dir;
            option.textContent = dir;
            saveDirList.appendChild(option);
        });
    }
    
    // 更新自定义下拉列表
    const dropdown = document.getElementById('save-dir-dropdown');
    if (dropdown) {
        dropdown.innerHTML = '';
        
        // 如果没有目录，添加提示
        if (sortedDirs.length === 0) {
            const item = document.createElement('div');
            item.className = 'dropdown-item';
            item.textContent = '暂无历史记录';
            dropdown.appendChild(item);
        } else {
            // 添加已存在的保存目录
            sortedDirs.forEach(dir => {
                const item = document.createElement('div');
                item.className = 'dropdown-item';
                item.textContent = dir;
                item.onclick = () => {
                    const input = document.querySelector('input[name="save_dir"]');
                    if (input) {
                        input.value = dir;
                    }
                    hideDropdown('save-dir-dropdown');
                };
                dropdown.appendChild(item);
            });
        }
    }
}

// 切换下拉列表显示状态
function toggleSaveDirDropdown() {
    const dropdown = document.getElementById('save-dir-dropdown');
    if (dropdown) {
        // 如果已经显示，则隐藏
        if (dropdown.classList.contains('active')) {
            hideDropdown('save-dir-dropdown');
            return;
        }
        
        // 否则显示下拉列表
        dropdown.classList.add('active');
        
        // 延迟添加事件监听器，避免立即触发
        setTimeout(() => {
            document.addEventListener('click', e => handleOutsideClick(e, 'save-dir-dropdown'));
        }, 10);
    }
}

// 隐藏下拉列表
function hideDropdown(dropdownId = 'save-dir-dropdown') {
    const dropdown = document.getElementById(dropdownId);
    if (dropdown) {
        dropdown.classList.remove('active');
        document.removeEventListener('click', handleOutsideClick);
    }
}

// 处理点击外部区域
function handleOutsideClick(event, dropdownId = 'save-dir-dropdown') {
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown) return;
    
    // 通过事件路径或事件目标检查用户是否点击了下拉按钮
    const clickedOnDropdownBtn = event.composedPath().some(el => 
        el.classList && el.classList.contains('dropdown-btn')
    );
    
    // 如果点击的不是下拉列表也不是下拉按钮，则隐藏下拉列表
    if (!dropdown.contains(event.target) && !clickedOnDropdownBtn) {
        hideDropdown(dropdownId);
    }
}

// 移动端事件处理
function initMobileEvents() {
    let lastTouchEnd = 0;
    
    // 防止双击缩放
    document.addEventListener('touchend', (e) => {
        const now = Date.now();
        if (now - lastTouchEnd <= 300) {
            e.preventDefault();
        }
        lastTouchEnd = now;
    }, { passive: false });

    // 添加触摸反馈
    const touchTargets = document.querySelectorAll('.btn, .btn-icon, .task-item');
    touchTargets.forEach(el => {
        el.addEventListener('touchstart', () => {
            el.style.opacity = '0.7';
        }, { passive: true });

        el.addEventListener('touchend', () => {
            el.style.opacity = '';
        }, { passive: true });

        el.addEventListener('touchcancel', () => {
            el.style.opacity = '';
        }, { passive: true });
    });
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    initMobileEvents();
});

// 更新登录凭据
async function updateAuth(data) {
    try {
        const response = await callApi('auth/update', 'POST', data);
        if (response.success) {
            showSuccess('登录凭据更新成功，即将退出登录...');
            // 清空输入框
            document.getElementById('new-username').value = '';
            document.getElementById('old-password').value = '';
            document.getElementById('new-password').value = '';
            document.getElementById('confirm-password').value = '';
            
            // 延迟2秒后退出登录，让用户看到成功消息
            setTimeout(() => {
                window.location.href = '/logout';
            }, 1000);
        } else {
            showError(response.message || '更新登录凭据失败');
        }
    } catch (error) {
        showError('更新登录凭据失败: ' + error.message);
    }
}

// 字段历史记录管理
function saveFieldHistory(fieldName, value) {
    if (!value) return;
    
    try {
        // 获取现有历史记录
        const historyObj = loadFromCache(CACHE_KEY.HISTORY) || {};
        
        // 为每个字段初始化一个数组
        if (!historyObj[fieldName]) {
            historyObj[fieldName] = [];
        }
        
        // 如果值已存在，则移除它（稍后会添加到最前面）
        const index = historyObj[fieldName].indexOf(value);
        if (index > -1) {
            historyObj[fieldName].splice(index, 1);
        }
        
        // 将新值添加到数组开头
        historyObj[fieldName].unshift(value);
        
        // 限制历史记录数量为10条
        if (historyObj[fieldName].length > 10) {
            historyObj[fieldName] = historyObj[fieldName].slice(0, 10);
        }
        
        // 保存更新后的历史记录
        saveToCache(CACHE_KEY.HISTORY, historyObj);
    } catch (error) {
        console.error('保存字段历史记录失败:', error);
    }
}

function getFieldHistory(fieldName) {
    try {
        const historyObj = loadFromCache(CACHE_KEY.HISTORY) || {};
        return historyObj[fieldName] || [];
    } catch (error) {
        console.error('获取字段历史记录失败:', error);
        return [];
    }
}

// 添加更新定时规则列表的函数
function updateCronList() {
    // 从任务中提取所有已使用的定时规则
    const cronExpressions = new Set();
    if (Array.isArray(state.tasks)) {
        state.tasks.forEach(task => {
            if (task.cron && task.cron.trim()) {
                cronExpressions.add(task.cron.trim());
            }
        });
    }
    
    // 获取历史记录
    const history = getFieldHistory('cron');
    history.forEach(cron => cronExpressions.add(cron));
    
    // 转换为排序后的数组
    const sortedCrons = Array.from(cronExpressions).sort();
    
    // 更新datalist
    const cronList = document.getElementById('cron-list');
    if (cronList) {
        cronList.innerHTML = '';
        
        // 添加所有定时规则
        sortedCrons.forEach(cron => {
            const option = document.createElement('option');
            option.value = cron;
            option.textContent = cron;
            cronList.appendChild(option);
        });
    }
    
    // 更新自定义下拉列表
    const dropdown = document.getElementById('cron-dropdown');
    if (dropdown) {
        dropdown.innerHTML = '';
        
        // 如果没有规则，添加提示
        if (sortedCrons.length === 0) {
            const item = document.createElement('div');
            item.className = 'dropdown-item';
            item.textContent = '暂无历史记录';
            dropdown.appendChild(item);
        } else {
            // 添加所有定时规则
            sortedCrons.forEach(cron => {
                const item = document.createElement('div');
                item.className = 'dropdown-item';
                item.textContent = cron;
                item.onclick = () => {
                    const input = document.querySelector('input[name="cron"]');
                    if (input) {
                        input.value = cron;
                    }
                    hideDropdown('cron-dropdown');
                };
                dropdown.appendChild(item);
            });
        }
    }
}

// 根据ID查找任务
function findTaskById(taskId) {
    if (!Array.isArray(state.tasks)) return null;
    return state.tasks.find(task => task.id === taskId || task.order === taskId + 1);
}

// 绑定任务列表中每个任务的事件
function bindTaskEvents() {
    const taskItems = document.querySelectorAll('.task-item');
    taskItems.forEach(item => {
        const taskId = item.getAttribute('data-id');
        
        // 绑定执行按钮
        const executeBtn = item.querySelector('.execute-btn');
        if (executeBtn) {
            executeBtn.onclick = () => executeTask(taskId);
        }
        
        // 绑定编辑按钮
        const editBtn = item.querySelector('.edit-btn');
        if (editBtn) {
            editBtn.onclick = () => editTask(taskId);
        }
        
        // 绑定删除按钮
        const deleteBtn = item.querySelector('.delete-btn');
        if (deleteBtn) {
            deleteBtn.onclick = () => confirmDelete(taskId);
        }
        
        // 绑定任务选择框
        const checkbox = item.querySelector('.task-checkbox');
        if (checkbox) {
            checkbox.onchange = () => toggleTaskSelection(taskId);
        }
    });
}

// 切换定时规则下拉列表
function toggleCronDropdown() {
    const dropdown = document.getElementById('cron-dropdown');
    if (dropdown) {
        // 如果已经显示，则隐藏
        if (dropdown.classList.contains('active')) {
            hideDropdown('cron-dropdown');
            return;
        }
        
        // 否则显示下拉列表
        dropdown.classList.add('active');
        
        // 延迟添加事件监听器，避免立即触发
        setTimeout(() => {
            document.addEventListener('click', e => handleOutsideClick(e, 'cron-dropdown'));
        }, 10);
    }
}

// 切换分类标签下拉列表
function toggleCategoryDropdown() {
    const dropdown = document.getElementById('category-dropdown');
    if (dropdown) {
        // 如果已经显示，则隐藏
        if (dropdown.classList.contains('active')) {
            hideDropdown('category-dropdown');
            return;
        }
        
        // 否则显示下拉列表
        dropdown.classList.add('active');
        
        // 延迟添加事件监听器，避免立即触发
        setTimeout(() => {
            document.addEventListener('click', e => handleOutsideClick(e, 'category-dropdown'));
        }, 10);
    }
}

// 文件过滤与重命名相关函数
function toggleFilterSection() {
    const section = document.getElementById('filter-section');
    const icon = document.querySelector('.toggle-header[onclick="toggleFilterSection()"] .toggle-icon');
    if (section.style.display === 'none') {
        section.style.display = 'block';
        icon.textContent = 'expand_less';
    } else {
        section.style.display = 'none';
        icon.textContent = 'expand_more';
    }
}

function toggleRenameSection() {
    const section = document.getElementById('rename-section');
    const icon = document.querySelector('.toggle-header[onclick="toggleRenameSection()"] .toggle-icon');
    if (section.style.display === 'none') {
        section.style.display = 'block';
        icon.textContent = 'expand_less';
    } else {
        section.style.display = 'none';
        icon.textContent = 'expand_more';
    }
}

function updateRenameFields() {
    // 隐藏所有重命名字段
    const allFields = document.querySelectorAll('.rename-fields');
    allFields.forEach(field => field.style.display = 'none');
    
    // 获取选择的重命名类型
    const renameType = document.querySelector('select[name="rename_type"]').value;
    if (!renameType) return;
    
    // 显示对应的字段
    const fieldsToShow = document.getElementById(`rename_${renameType}_fields`);
    if (fieldsToShow) {
        fieldsToShow.style.display = 'block';
    }
}

// 构建文件过滤配置对象
function buildFileFiltersConfig() {
    const filterSection = document.getElementById('filter-section');
    
    // 如果过滤区域未显示，返回null
    if (filterSection.style.display === 'none') {
        return null;
    }
    
    const filterType = document.querySelector('input[name="filter_type"]:checked').value;
    const patternsInput = document.querySelector('input[name="filter_patterns"]').value.trim();
    const regexInput = document.querySelector('input[name="filter_regex"]').value.trim();
    
    // 如果没有任何过滤条件，返回null
    if (!patternsInput && !regexInput) {
        return null;
    }
    
    const fileFilters = {
        type: filterType
    };
    
    // 处理文件模式匹配
    if (patternsInput) {
        fileFilters.patterns = patternsInput.split(',').map(p => p.trim()).filter(p => p);
    }
    
    // 处理正则表达式
    if (regexInput) {
        fileFilters.regex = regexInput;
    }
    
    return fileFilters;
}

// 构建重命名规则配置对象
function buildRenameRulesConfig() {
    const renameSection = document.getElementById('rename-section');
    
    // 如果重命名区域未显示，返回null
    if (renameSection.style.display === 'none') {
        return null;
    }
    
    const renameType = document.querySelector('select[name="rename_type"]').value;
    
    // 如果没有选择重命名类型，返回null
    if (!renameType) {
        return null;
    }
    
    const renameRules = {
        type: renameType,
        rules: {}
    };
    
    // 根据类型处理规则
    switch (renameType) {
        case 'pattern':
            const pattern = document.querySelector('input[name="rename_pattern"]').value.trim();
            const replacement = document.querySelector('input[name="rename_replacement"]').value.trim();
            if (pattern && replacement) {
                renameRules.rules = {
                    pattern: pattern,
                    replacement: replacement
                };
            } else {
                return null;  // 如果缺少必填项，返回null
            }
            break;
            
        case 'prefix':
            const prefix = document.querySelector('input[name="rename_prefix"]').value.trim();
            if (prefix) {
                renameRules.rules = {
                    prefix: prefix
                };
            } else {
                return null;
            }
            break;
            
        case 'suffix':
            const suffix = document.querySelector('input[name="rename_suffix"]').value.trim();
            if (suffix) {
                renameRules.rules = {
                    suffix: suffix
                };
            } else {
                return null;
            }
            break;
            
        case 'exact':
            const exactMatchText = document.querySelector('textarea[name="rename_exact_match"]').value.trim();
            try {
                if (exactMatchText) {
                    const exactMatch = JSON.parse(exactMatchText);
                    renameRules.rules = {
                        exact_match: exactMatch
                    };
                } else {
                    return null;
                }
            } catch (e) {
                showError('精确匹配替换规则格式错误，请使用正确的JSON格式');
                return null;
            }
            break;
            
        default:
            return null;
    }
    
    return renameRules;
}