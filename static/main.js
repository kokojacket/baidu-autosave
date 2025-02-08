// 本地缓存管理
const CACHE_KEY = {
    TASKS: 'baidu_autosave_tasks',
    USERS: 'baidu_autosave_users',
    CONFIG: 'baidu_autosave_config'
};

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

// WebSocket配置
const WS_CONFIG = {
    maxRetries: 3,           // 最大重试次数
    retryInterval: 5000,     // 初始重试间隔（毫秒）
    reconnectBackoff: 1.5,   // 重试间隔增长系数
    pingInterval: 20000,     // 心跳间隔（毫秒）
    pingTimeout: 8000,       // 心跳超时时间（毫秒）
    debug: true             // 是否启用调试日志
};

// 全局状态管理
const state = {
    tasks: [],
    users: [],
    config: {},
    currentUser: null,
    categories: new Set() // 用于存储所有已使用的分类
};

// WebSocket连接管理
let socket = null;
let wsRetryTimeout = null;
let wsPingInterval = null;
let wsPingTimeout = null;
let retryCount = 0;
let isConnecting = false;
let lastPongTime = 0;
let lastServerTime = 0;
let heartbeatInterval = null;

// 初始化WebSocket连接
function initWebSocket() {
    // 如果已经存在连接，先关闭
    if (socket) {
        socket.close();
        socket = null;
    }
    
    // 清除之前的心跳定时器
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
    
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = window.location.hostname || '127.0.0.1';
    const wsPort = window.location.port || '5000';
    const ws = new WebSocket(`${wsProtocol}//${wsHost}:${wsPort}/ws`);
    
    let reconnectTimer = null;
    let isReconnecting = false;
    
    ws.onopen = function() {
        console.log('WebSocket 连接已建立');
        isReconnecting = false;
        // 发送初始状态请求
        ws.send(JSON.stringify({ type: 'get_status' }));
        
        // 设置新的心跳
        heartbeatInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'ping' }));
            }
        }, 30000);
    };
    
    ws.onmessage = function(event) {
        try {
            const data = JSON.parse(event.data);
            
            // 处理心跳ping
            if (data.type === 'ping') {
                ws.send(JSON.stringify({type: 'pong'}));
                return;
            }
            
            // 处理其他消息类型
            switch(data.type) {
                case 'task_log':
                    handleTaskLog(data.data);
                    break;
                case 'task_progress':
                    handleTaskProgress(data.data);
                    break;
            }
        } catch (error) {
            console.error('处理WebSocket消息时出错:', error);
        }
    };
    
    ws.onclose = function(event) {
        console.log(`WebSocket 连接已关闭，代码: ${event.code} 原因: ${event.reason}`);
        if (retryCount < WS_CONFIG.maxRetries) {
            const delay = Math.min(1000 * Math.pow(2, retryCount), WS_CONFIG.retryInterval);
            console.log(`${Math.round(delay/1000)}秒后尝试重新连接(${retryCount + 1}/${WS_CONFIG.maxRetries})`);
            setTimeout(() => {
                retryCount++;
                socket = initWebSocket();
            }, delay);
        }
    };
    
    ws.onerror = function(error) {
        console.error('WebSocket 错误:', error);
    };
    
    return ws;
}

// 处理WebSocket消息
function handleWebSocketMessage(data) {
    if (!data || !data.type) return;
    
    switch (data.type) {
        case 'task_status':
            // 更新任务状态
            if (data.task_id !== undefined && data.status) {
                updateTaskStatus(data.task_id, data.status, data.message);
            }
            break;
            
        case 'task_progress':
            // 更新任务进度
            if (data.task_id !== undefined && data.progress !== undefined) {
                updateTaskProgress(data.task_id, data.progress);
            }
            break;
            
        case 'refresh':
            // 刷新任务列表
            refreshTasks();
            break;
    }
}

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
    
    // 更新按钮状态
    const buttons = taskElement.querySelectorAll('.btn-icon');
    buttons.forEach(btn => {
        btn.disabled = status === 'running';
    });
    
    // 如果有消息，显示通知
    if (message) {
        showNotification(message, status === 'error' ? 'error' : 'info');
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
        progressBar.innerHTML = '<div class="progress"></div>';
        taskContent.appendChild(progressBar);
    }
    
    const progressElement = progressBar.querySelector('.progress');
    if (progressElement) {
        progressElement.style.width = `${progress}%`;
        progressElement.setAttribute('aria-valuenow', progress);
    }
}

// 加载状态管理
function showLoading(message = '加载中...') {
    const loading = document.createElement('div');
    loading.className = 'loading-overlay';
    loading.innerHTML = `
        <div class="loading-spinner"></div>
        <div class="loading-message">${message}</div>
    `;
    document.body.appendChild(loading);
}

function hideLoading() {
    const loading = document.querySelector('.loading-overlay');
    if (loading) {
        loading.remove();
    }
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
                <span class="cron-rule">${task.cron ? `自定义定时：${task.cron}` : `默认定时：${state.config.cron?.default_schedule?.join(';') || '未设置'}`}</span>
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
        <div class="task-actions">
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
    if (state.currentUser && state.currentUser.username === user.username) {
        div.classList.add('active');
    }
    
    div.innerHTML = `
        <div class="user-name">
            <span>${user.name || user.username}</span>
            ${state.currentUser && state.currentUser.username === user.username ? 
                '<span class="badge">当前用户</span>' : ''}
        </div>
        <div class="user-actions">
            ${state.currentUser && state.currentUser.username === user.username ? '' : `
                <button class="btn-icon" onclick="switchUser('${user.username}')" title="切换到该用户">
                    <i class="material-icons">swap_horiz</i>
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
    const pushplusToken = document.getElementById('pushplus-token');
    const pushplusTopic = document.getElementById('pushplus-topic');
    const globalCron = document.getElementById('global-cron');
    
    if (!globalCron) {
        console.error('未找到全局定时规则输入框元素');
        return;
    }
    
    // 处理通知配置
    if (state.config.notify) {
        console.log('渲染通知配置:', state.config.notify);
        notifyEnabled.checked = state.config.notify.enabled;
        pushplusToken.value = state.config.notify.channels?.pushplus?.token || '';
        pushplusTopic.value = state.config.notify.channels?.pushplus?.topic || '';
    }
    
    // 处理定时配置
    console.log('开始处理定时配置，完整配置对象:', state.config);
    const cronRules = [];
    
    // 优先从cron配置中获取
    if (state.config.cron && Array.isArray(state.config.cron.default_schedule)) {
        console.log('从cron配置获取定时规则:', state.config.cron);
        cronRules.push(...state.config.cron.default_schedule);
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
    
    // 设置输入框的值
    const cronValue = cronRules.join(';');
    console.log('最终定时规则字符串:', cronValue);
    globalCron.value = cronValue;
}

// 状态栏更新
function updateStatusBar(message = '') {
    const statusBar = document.getElementById('status-message');
    statusBar.textContent = message || '就绪';
}

// 模态框操作
function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
        
        // 如果是任务表单且不是编辑模式（没有task_id），自动填充上一个任务的目录和分类
        if (modalId === 'task-modal') {
            const form = modal.querySelector('form');
            const taskIdInput = form.querySelector('[name="task_id"]');
            if (!taskIdInput.value) {  // 确保是新增任务而不是编辑任务
                const tasks = state.tasks || [];
                if (tasks.length > 0) {
                    const lastTask = tasks[tasks.length - 1];
                    form.querySelector('[name="save_dir"]').value = lastTask.save_dir || '';
                    form.querySelector('[name="category"]').value = lastTask.category || '';
                }
                // 更新保存目录下拉列表
                updateSaveDirList();
            }
            // 更新分类列表
            updateCategoryList();
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
        // 获取任务的order
        const task = state.tasks.find(t => t.order === taskId + 1);
        if (!task) {
            showError('任务不存在');
            return;
        }

        // 禁用执行按钮
        const taskElement = document.querySelector(`.task-item[data-task-id="${taskId}"]`);
        const executeBtn = taskElement?.querySelector('button[onclick^="executeTask"]');
        if (executeBtn) {
            executeBtn.disabled = true;
        }
        
        // 清空并显示日志窗口
        clearLog();
        showModal('progress-modal');
        
        // 添加初始日志
        const taskName = task.name || `任务${task.order}`;
        appendLog(`开始执行任务: ${taskName}`, 'info');
        appendLog(`分享链接: ${task.url}`, 'info');
        appendLog(`保存目录: ${task.save_dir}`, 'info');
        if (task.pwd) {
            appendLog(`提取码: ${task.pwd}`, 'info');
        }
        
        // 发送执行请求，使用task_id作为标识
        const response = await callApi('task/execute', 'POST', { task_id: taskId }, false);
        
        if (response.success) {
            // 处理转存文件列表
            if (response.transferred_files && response.transferred_files.length > 0) {
                appendLog('\n成功转存以下文件:', 'success');
                // 按目录分组显示文件
                const filesByDir = {};
                response.transferred_files.forEach(file => {
                    const dir = file.split('/').slice(0, -1).join('/') || '/';
                    if (!filesByDir[dir]) {
                        filesByDir[dir] = [];
                    }
                    filesByDir[dir].push(file.split('/').pop());
                });
                
                // 显示分组后的文件
                Object.entries(filesByDir).forEach(([dir, files]) => {
                    appendLog(`\n目录: ${dir}`, 'info');
                    files.sort().forEach(file => {
                        appendLog(`  - ${file}`, 'info');
                    });
                });
            } else if (response.message.includes('没有新文件')) {
                appendLog('\n检查文件更新:', 'info');
                appendLog('没有发现新文件需要转存', 'warning');
            }
            
            appendLog(`\n执行结果: ${response.message}`, 'success');
            showSuccess(response.message);
            
            // 刷新任务列表
            await refreshTasks();
        } else {
            appendLog(`\n执行失败: ${response.message}`, 'error');
            showError(response.message);
        }
    } catch (error) {
        console.error('执行任务失败:', error);
        appendLog(`\n执行出错: ${error.message || '未知错误'}`, 'error');
        showError(error.message || '执行任务失败');
    } finally {
        // 恢复执行按钮状态
        const taskElement = document.querySelector(`.task-item[data-task-id="${taskId}"]`);
        const executeBtn = taskElement?.querySelector('button[onclick^="executeTask"]');
        if (executeBtn) {
            executeBtn.disabled = false;
        }
    }
}

async function editTask(taskId) {
    try {
        // 获取最新的任务列表
        const response = await callApi('tasks', 'GET');
        if (!response.success) {
            showError(response.message || '获取任务信息失败');
            return;
        }
        
        // 按order排序
        const tasks = response.tasks.sort((a, b) => (a.order || Infinity) - (b.order || Infinity));
        
        // 查找对应的任务
        const task = tasks.find(t => t.order === taskId + 1);
        if (!task) {
            showError('未找到任务');
            return;
        }
        
        // 填充表单
        const form = document.getElementById('task-form');
        form.querySelector('[name="task_id"]').value = taskId;  // 使用task_id而不是order
        
        // 处理URL和密码
        const url = task.pwd ? `${task.url}?pwd=${task.pwd}` : task.url;
        form.querySelector('[name="url"]').value = url;
        form.querySelector('[name="save_dir"]').value = task.save_dir || '';
        form.querySelector('[name="name"]').value = task.name || '';
        form.querySelector('[name="cron"]').value = task.cron || '';
        form.querySelector('[name="category"]').value = task.category || '';
        
        // 更新下拉列表
        updateCategoryList();
        updateSaveDirList();
        
        // 显示模态框
        showModal('task-modal');
        
    } catch (error) {
        showError('编辑任务失败: ' + error.message);
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
    for(let i = 0; i < retryCount; i++) {
        try {
            const result = await callApi('tasks');
            if (result.success) {
                // 检查任务数量变化
                const prevCount = state.tasks.length;
                const newCount = result.tasks.length;
                
                if (Math.abs(newCount - prevCount) > 1) {
                    console.warn('任务数量变化异常:', {
                        previous: prevCount,
                        current: newCount
                    });
                    showError('任务同步可能存在问题，请检查任务列表');
                }
                
                updateState({ tasks: result.tasks });
                return;
            }
        } catch (error) {
            console.error(`刷新任务列表失败(第${i+1}次尝试):`, error);
            if (i === retryCount - 1) {
                showError('刷新任务列表失败，请手动刷新页面');
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}

// 修改任务更新函数
async function updateTask(data) {
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
        if (url.includes('?pwd=')) {
            [url, pwd] = url.split('?pwd=');
            url = url.trim();
            pwd = pwd.trim();
        }
        
        // 创建完整的更新数据对象
        const updateData = {
            task_id: taskId,  // 使用taskId而不是order
            url: url,
            save_dir: data.save_dir.trim(),
            pwd: pwd || originalTask.pwd || '',  // 保留原密码如果没有新密码
            name: data.name.trim() || originalTask.name || '',
            category: data.category.trim() || originalTask.category || '',
            cron: data.cron.trim() || originalTask.cron || '',
            status: originalTask?.status || 'normal',  // 保持原有状态
            message: originalTask?.message || '',      // 保持原有消息
            last_execute_time: originalTask?.last_execute_time // 保持原有执行时间
        };
        
        console.log('更新任务数据:', {
            taskId,
            originalTask,
            updateData
        });
        
        // 发送更新请求
        const response = await callApi('task/update', 'POST', updateData);
        if (response.success) {
            await afterTaskOperation();
            showSuccess('更新任务成功');
            hideModal('task-modal');
        } else {
            throw new Error(response.message || '更新任务失败');
        }
    } catch (error) {
        console.error('更新任务失败:', error);
        showError(error.message || '更新任务失败');
        // 强制刷新以确保显示正确状态
        await refreshTasks();
    }
}

// 用户操作
async function addUser(data) {
    try {
        const result = await callApi('user/add', 'POST', data);
        state.users = result.users;
        renderUsers();
        hideModal('user-modal');
        showSuccess('用户添加成功');
    } catch (error) {
        showError('添加用户失败');
    }
}

async function switchUser(username) {
    try {
        showLoading('正在切换用户...');
        await callApi('user/switch', 'POST', { username });
        
        // 更新当前用户
        const user = state.users.find(u => u.username === username);
        state.currentUser = user;
        
        // 更新UI
        renderUsers();
        updateLoginStatus(user);
        
        showSuccess('切换用户成功');
        
        // 刷新任务列表
        await refreshTasks();
    } catch (error) {
        showError('切换用户失败');
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
        const pushplusToken = document.getElementById('pushplus-token').value.trim();
        const pushplusTopic = document.getElementById('pushplus-topic').value.trim();
        const globalCron = document.getElementById('global-cron').value.trim();
        
        // 处理定时规则
        const cronRules = globalCron.split(';')
            .map(rule => rule.trim())
            .filter(rule => rule.length > 0);
            
        console.log('处理后的定时规则:', cronRules);
        
        const config = {
            notify: {
                enabled: notifyEnabled,
                channels: {
                    pushplus: {
                        token: pushplusToken,
                        topic: pushplusTopic
                    }
                }
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
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    
    try {
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
        
        // 如果有task_id，说明是编辑任务
        if (data.task_id) {
            // 获取原有任务的状态和消息
            const taskId = parseInt(data.task_id);
            const originalTask = state.tasks.find(t => t.order === taskId + 1);
            
            const response = await callApi('task/update', 'POST', {
                task_id: taskId,
                url: data.url,
                pwd: data.pwd,
                save_dir: data.save_dir,
                name: data.name || '',
                cron: data.cron || '',
                category: data.category || '',
                status: originalTask?.status || 'normal',  // 保持原有状态
                message: originalTask?.message || '',      // 保持原有消息
                last_execute_time: originalTask?.last_execute_time // 保持原有执行时间
            });
            
            if (response.success) {
                await afterTaskOperation();
                hideModal('task-modal');
                showSuccess('任务更新成功');
            }
        } else {
            // 新增任务
            await addTask({
                url: data.url,
                pwd: data.pwd,
                save_dir: data.save_dir,
                name: data.name || '',
                cron: data.cron || '',
                category: data.category || ''
            });
        }
    } catch (error) {
        showError(error.message || '保存任务失败');
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
        Array.from(state.categories).sort().forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            categoryList.appendChild(option);
        });
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
        showLoading('正在加载数据...');
        
        // 并行请求数据
        const [tasksResult, usersResult, configResult, categoriesResult] = await Promise.all([
            callApi('tasks', 'GET', null, false),
            callApi('users', 'GET', null, false),
            callApi('config', 'GET', null, false),
            callApi('categories', 'GET', null, false)
        ]);
        
        // 更新状态
        const users = usersResult.users || [];
        const config = configResult.config || {};
        
        // 查找当前用户
        let currentUser = null;
        const currentUserName = config.baidu?.current_user;
        
        if (currentUserName && users.length > 0) {
            currentUser = users.find(u => 
                u.username === currentUserName || 
                u.name === currentUserName
            );
            
            // 如果找不到用户但有用户名，创建一个基本用户对象
            if (!currentUser && currentUserName) {
                currentUser = {
                    username: currentUserName,
                    name: currentUserName
                };
            }
        } else if (users.length === 1) {
            // 如果只有一个用户，就使用这个用户
            currentUser = users[0];
        }
        
        // 一次性更新所有状态，避免多次渲染
        updateState({
            tasks: tasksResult.tasks || [],
            users: users,
            config: config,
            currentUser: currentUser,
            categories: new Set(categoriesResult.categories || [])
        });

        // 更新分类按钮
        updateCategoryButtons(categoriesResult.categories || []);
        
        showSuccess('数据加载完成');
    } catch (error) {
        console.error('初始化数据失败:', error);
        showError('加载数据失败，请刷新页面重试');
    } finally {
        hideLoading();
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
}

// 在任务状态更改后更新分类
async function refreshCategories() {
    updateCategoryButtons();
}

// 在任务添加、更新或删除后调用
async function afterTaskOperation() {
    try {
        // 刷新任务列表
        await refreshTasks();
        
        // 获取最新的分类列表
        const result = await callApi('categories');
        if (result.success) {
            // 更新state中的分类
            state.categories = new Set(result.categories || []);
            // 更新分类按钮
            updateCategoryButtons(result.categories);
            // 更新分类下拉列表
            updateCategoryList();
        }
    } catch (error) {
        console.error('更新分类失败:', error);
        showError('更新分类失败，请刷新页面');
    }
}

// 处理任务进度更新
function handleTaskProgress(data) {
    const { taskId, progress, status } = data;
    const taskElement = document.querySelector(`.task-item[data-task-id="${taskId}"]`);
    if (!taskElement) return;
    
    // 更新进度条
    let progressBar = taskElement.querySelector('.progress-bar');
    if (!progressBar && status === 'running') {
        // 如果不存在进度条且任务正在运行，创建进度条
        const taskContent = taskElement.querySelector('.task-content');
        progressBar = document.createElement('div');
        progressBar.className = 'progress-bar';
        progressBar.innerHTML = '<div class="progress"></div>';
        taskContent.appendChild(progressBar);
    }
    
    if (progressBar) {
        const progressElement = progressBar.querySelector('.progress');
        if (progressElement) {
            progressElement.style.width = `${progress}%`;
            progressElement.setAttribute('aria-valuenow', progress);
        }
        
        // 如果任务完成或失败，延迟移除进度条
        if (status !== 'running') {
            setTimeout(() => {
                progressBar.remove();
            }, 3000);
        }
    }
    
    // 更新状态
    const statusElement = taskElement.querySelector('.task-status');
    if (statusElement) {
        statusElement.className = `task-status ${status}`;
        statusElement.textContent = getStatusText(status);
    }
    
    // 更新任务元素的状态
    taskElement.dataset.status = status;
    
    // 更新按钮状态
    const buttons = taskElement.querySelectorAll('.btn-icon');
    buttons.forEach(btn => {
        btn.disabled = status === 'running';
    });
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
        
        await addUser(data);
        hideModal('user-modal');
        showSuccess('用户添加成功');
    } catch (error) {
        showError(error.message || '添加用户失败');
    } finally {
        // 恢复按钮状态
        submitBtn.disabled = false;
        submitBtn.innerHTML = '保存';
    }
}

// 初始化应用
async function initializeApp() {
    try {
        // 1. 创建必要的UI元素
        createNotificationContainer();
        
        // 2. 初始化数据
        await initializeData();
        
        // 3. 初始化WebSocket连接
        socket = initWebSocket();
        
        // 4. 添加事件监听
        initializeEventListeners();
        
    } catch (error) {
        console.error('应用初始化失败:', error);
        showError('应用初始化失败，请刷新页面重试');
    }
}

// 初始化事件监听器
function initializeEventListeners() {
    // 导航按钮点击事件处理
    initNavigation();
    
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
    
    // 状态筛选
    document.querySelectorAll('.status-btn').forEach(btn => {
        // 同时监听 click 和 touchend 事件
        ['click', 'touchend'].forEach(eventType => {
            btn.addEventListener(eventType, (e) => {
                e.preventDefault(); // 阻止默认行为
                document.querySelectorAll('.status-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                filterTasks();
            }, { passive: false });
        });
    });
    
    // 分类筛选
    document.querySelectorAll('.category-btn').forEach(btn => {
        ['click', 'touchend'].forEach(eventType => {
            btn.addEventListener(eventType, (e) => {
                e.preventDefault();
                const category = btn.dataset.category;
                filterByCategory(category);
            }, { passive: false });
        });
    });
    
    // 添加任务按钮
    const addTaskBtn = document.getElementById('add-task-btn');
    if (addTaskBtn) {
        ['click', 'touchend'].forEach(eventType => {
            addTaskBtn.addEventListener(eventType, (e) => {
                e.preventDefault();
                document.getElementById('task-form').reset();
                showModal('task-modal');
            }, { passive: false });
        });
    }
    
    // 添加用户按钮
    const addUserBtn = document.getElementById('add-user-btn');
    if (addUserBtn) {
        ['click', 'touchend'].forEach(eventType => {
            addUserBtn.addEventListener(eventType, (e) => {
                e.preventDefault();
                document.getElementById('user-form').reset();
                showModal('user-modal');
            }, { passive: false });
        });
    }
    
    // 保存设置按钮
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    if (saveSettingsBtn) {
        ['click', 'touchend'].forEach(eventType => {
            saveSettingsBtn.addEventListener(eventType, (e) => {
                e.preventDefault();
                saveConfig();
            }, { passive: false });
        });
    }
    
    // 测试通知按钮
    const testNotifyBtn = document.getElementById('test-notify-btn');
    if (testNotifyBtn) {
        ['click', 'touchend'].forEach(eventType => {
            testNotifyBtn.addEventListener(eventType, (e) => {
                e.preventDefault();
                testNotify();
            }, { passive: false });
        });
    }
    
    // 表单提交事件
    const taskForm = document.getElementById('task-form');
    if (taskForm) {
        taskForm.addEventListener('submit', handleTaskSubmit);
    }
    
    const userForm = document.getElementById('user-form');
    if (userForm) {
        userForm.addEventListener('submit', handleUserSubmit);
    }
    
    // 初始化拖拽功能
    initDragAndDrop();
    
    // 确保所有按钮都能正常工作
    document.querySelectorAll('.btn, .nav-btn, .btn-icon').forEach(btn => {
        btn.addEventListener('touchstart', function() {
            this.style.opacity = '0.7';
        }, { passive: true });

        btn.addEventListener('touchend', function() {
            this.style.opacity = '';
        }, { passive: true });

        btn.addEventListener('touchcancel', function() {
            this.style.opacity = '';
        }, { passive: true });
    });
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
        previousText: currentUserElement.textContent
    });
    
    if (user) {
        const displayName = user.name || user.username;
        currentUserElement.innerHTML = `
            <span class="user-name">${displayName}</span>
            <button class="btn-icon logout-btn" onclick="logout()" title="退出登录">
                <i class="material-icons">logout</i>
            </button>
        `;
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

// 添加登出功能
function logout() {
    window.location.href = '/logout';
}

// 添加任务验证函数
async function verifyTaskUpdate(originalTask, updateData) {
    try {
        // 重新获取任务列表
        const result = await callApi('tasks');
        if (!result.success) {
            return { success: false, error: '获取任务列表失败' };
        }
        
        // 查找更新后的任务
        const updatedTask = result.tasks.find(t => 
            t.url === updateData.url || 
            t.url === originalTask.url
        );
        
        // 检查任务是否存在
        if (!updatedTask) {
            return { 
                success: false, 
                error: '无法找到更新后的任务' 
            };
        }
        
        // 检查是否有重复任务
        const duplicateTasks = result.tasks.filter(t => 
            t.url === updateData.url || 
            t.url === originalTask.url
        );
        
        if (duplicateTasks.length > 1) {
            return { 
                success: false, 
                error: '发现重复任务',
                duplicates: duplicateTasks 
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

// 更新保存目录下拉列表
function updateSaveDirList() {
    // 从任务中提取所有已使用的保存目录
    const saveDirs = new Set();
    if (Array.isArray(state.tasks)) {
        state.tasks.forEach(task => {
            if (task.save_dir) {
                // 去掉最后一级目录
                const dirPath = task.save_dir.split('/').slice(0, -1).join('/');
                if (dirPath) {
                    saveDirs.add(dirPath);
                }
            }
        });
    }
    
    // 更新datalist
    const saveDirList = document.getElementById('save-dir-list');
    if (saveDirList) {
        saveDirList.innerHTML = '';
        
        // 添加已存在的保存目录
        Array.from(saveDirs).sort().forEach(dir => {
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
        Array.from(saveDirs).sort().forEach(dir => {
            const item = document.createElement('div');
            item.className = 'dropdown-item';
            item.textContent = dir;
            item.onclick = () => {
                const input = document.querySelector('input[name="save_dir"]');
                if (input) {
                    input.value = dir;
                }
                hideDropdown();
            };
            dropdown.appendChild(item);
        });
    }
}

// 切换下拉列表显示状态
function toggleSaveDirDropdown() {
    const dropdown = document.getElementById('save-dir-dropdown');
    if (dropdown) {
        dropdown.classList.toggle('active');
        
        // 如果下拉列表显示，添加点击外部区域关闭的事件监听
        if (dropdown.classList.contains('active')) {
            setTimeout(() => {
                document.addEventListener('click', handleOutsideClick);
            }, 0);
        }
    }
}

// 隐藏下拉列表
function hideDropdown() {
    const dropdown = document.getElementById('save-dir-dropdown');
    if (dropdown) {
        dropdown.classList.remove('active');
        document.removeEventListener('click', handleOutsideClick);
    }
}

// 处理点击外部区域
function handleOutsideClick(event) {
    const dropdown = document.getElementById('save-dir-dropdown');
    const dropdownBtn = document.querySelector('.dropdown-btn');
    
    if (dropdown && !dropdown.contains(event.target) && !dropdownBtn.contains(event.target)) {
        hideDropdown();
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