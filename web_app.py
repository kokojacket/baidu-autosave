from flask import Flask, request, jsonify, render_template, send_from_directory, session, redirect, url_for
from storage import BaiduStorage
from scheduler import TaskScheduler
import json
from loguru import logger
import sys
import os
import atexit
import re
from functools import wraps
import signal
from utils import generate_transfer_notification
from notify import send as notify_send
from datetime import datetime
from flask_cors import CORS
from geventwebsocket.handler import WebSocketHandler
from geventwebsocket.websocket import WebSocket
from gevent.pywsgi import WSGIServer
import time
from gevent.queue import Queue
from geventwebsocket.exceptions import WebSocketError
import socket

# 创建日志目录
os.makedirs('log', exist_ok=True)

# 配置日志
logger.remove()  # 移除默认的控制台输出
# 添加控制台输出，设置日志级别为 INFO
logger.add(sys.stdout, level="INFO", 
          format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>")
# 添加文件输出，设置日志级别为 DEBUG
logger.add("log/web_app_{time:YYYY-MM-DD}.log", 
          rotation="00:00", # 每天零点创建新文件
          retention="7 days", # 保留7天的日志
          level="DEBUG",
          encoding="utf-8",
          format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {name}:{function}:{line} - {message}")

app = Flask(__name__)
app.secret_key = 'your-secret-key-here'  # 用于session加密
CORS(app)

# 全局变量声明
storage = None
scheduler = None

# WebSocket连接管理
clients = set()

# 登录装饰器
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'username' not in session:
            return redirect(url_for('login'))
            
        # 检查会话是否过期
        auth_config = storage.config.get('auth', {})
        session_timeout = auth_config.get('session_timeout', 3600)
        if time.time() - session.get('login_time', 0) > session_timeout:
            session.clear()
            return redirect(url_for('login'))
            
        # 更新最后活动时间
        session['login_time'] = time.time()
        return f(*args, **kwargs)
    return decorated_function

def broadcast_message(message):
    """广播消息到所有WebSocket客户端"""
    disconnected_clients = set()
    for client in clients:
        try:
            if client and client.closed:
                disconnected_clients.add(client)
                continue
            client.send(json.dumps(message))
        except Exception as e:
            logger.error(f"发送WebSocket消息失败: {str(e)}")
            disconnected_clients.add(client)
    
    # 清理断开的连接
    for client in disconnected_clients:
        try:
            clients.remove(client)
        except:
            pass

def init_app():
    """初始化应用"""
    global storage, scheduler
    try:
        logger.info("开始初始化应用...")
        # 初始化存储
        logger.info("正在初始化存储...")
        storage = BaiduStorage()
        
        # 使用已创建的 storage 实例初始化调度器
        try:
            logger.info("正在初始化调度器...")
            scheduler = TaskScheduler(storage)
            scheduler.start()
            logger.info("调度器初始化成功")
        except Exception as e:
            logger.error(f"初始化调度器失败: {str(e)}")
            scheduler = None
        
        if not storage.is_valid():
            logger.warning("存储初始化成功，但未登录或未配置用户")
            
        logger.info("应用初始化完成")
        return True, None
        
    except Exception as e:
        error_msg = f"应用初始化失败: {str(e)}"
        logger.error(error_msg)
        return False, error_msg

def cleanup():
    """清理资源"""
    global scheduler
    if scheduler:
        try:
            if hasattr(scheduler, 'is_running') and scheduler.is_running:
                scheduler.stop()
            scheduler = None
            logger.info("调度器已停止")
        except Exception as e:
            logger.error(f"停止调度器失败: {str(e)}")

def handle_api_error(f):
    """API错误处理装饰器"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        try:
            return f(*args, **kwargs)
        except Exception as e:
            error_msg = f"{f.__name__} 失败: {str(e)}"
            logger.error(error_msg)
            return jsonify({'success': False, 'message': error_msg})
    return decorated_function

@app.route('/login', methods=['GET', 'POST'])
def login():
    """登录处理"""
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        
        if not storage:
            return render_template('login.html', message='系统未初始化')
            
        # 验证用户名和密码
        auth_config = storage.config.get('auth', {})
        if (username == auth_config.get('users') and 
            password == auth_config.get('password')):
            session['username'] = username
            session['login_time'] = time.time()
            return redirect(url_for('index'))
        else:
            return render_template('login.html', message='用户名或密码错误')
            
    return render_template('login.html')

@app.route('/logout')
def logout():
    """登出处理"""
    session.clear()
    return redirect(url_for('login'))

@app.route('/')
@login_required
def index():
    """首页"""
    try:
        users = []
        tasks = []
        current_user = None
        config = {}
        login_status = False
        init_error = None
        
        if storage:
            try:
                users = storage.list_users()
                tasks = storage.list_tasks()
                current_user = storage.config['baidu'].get('current_user')
                config = {
                    'cron': storage.config.get('cron', {}),
                    'notify': storage.config.get('notify', {})
                }
                login_status = storage.is_valid()
            except Exception as e:
                logger.error(f"获取数据失败: {str(e)}")
                init_error = str(e)
        
        return render_template('index.html', 
                            users=users, 
                            tasks=tasks, 
                            config=config,
                            current_user=current_user,
                            storage=storage,
                            login_status=login_status,
                            init_error=init_error)
    except Exception as e:
        error_msg = f"加载页面失败: {str(e)}"
        logger.error(error_msg)
        return render_template('index.html',
                            users=[],
                            tasks=[],
                            config={},
                            current_user=None,
                            storage=None,
                            login_status=False,
                            init_error=error_msg)

@app.route('/api/tasks', methods=['GET'])
@login_required
@handle_api_error
def get_tasks():
    """获取所有任务"""
    if not storage:
        return jsonify({'success': False, 'message': '存储未初始化'})
    tasks = storage.list_tasks()
    # 按 order 排序，没有 order 的排在最后
    tasks.sort(key=lambda x: x.get('order', float('inf')))
    return jsonify({'success': True, 'tasks': tasks})

@app.route('/api/tasks/<int:task_id>/status', methods=['GET'])
@login_required
@handle_api_error
def get_task_status(task_id):
    """获取单个任务状态"""
    if not storage:
        return jsonify({'success': False, 'message': '存储未初始化'})
    tasks = storage.list_tasks()
    # 按 order 排序，确保 task_id 对应正确的任务
    tasks.sort(key=lambda x: x.get('order', float('inf')))
    if 0 <= task_id < len(tasks):
        return jsonify({'success': True, 'status': tasks[task_id]})
    return jsonify({'success': False, 'message': '任务不存在'})

@app.route('/api/tasks/running', methods=['GET'])
@login_required
@handle_api_error
def get_running_tasks():
    """获取正在运行的任务"""
    if not storage:
        return jsonify({'success': False, 'message': '存储未初始化'})
    tasks = storage.list_tasks()
    # 按 order 排序后再筛选运行中的任务
    tasks.sort(key=lambda x: x.get('order', float('inf')))
    running_tasks = [task for task in tasks if task.get('status') == 'running']
    return jsonify({'success': True, 'tasks': running_tasks})

@app.route('/api/task/add', methods=['POST'])
@login_required
@handle_api_error
def add_task():
    """添加任务"""
    data = request.get_json()
    url = data.get('url', '').strip()
    save_dir = data.get('save_dir', '').strip()
    pwd = data.get('pwd', '').strip()
    name = data.get('name', '').strip()
    cron = data.get('cron', '').strip()
    category = data.get('category', '').strip()
    
    if not url or not save_dir:
        return jsonify({'success': False, 'message': '分享链接和保存目录不能为空'})
    
    # 移除URL中的hash部分
    if '#' in url:
        url = url.split('#')[0]
        
    # 处理URL中的密码部分
    if '?pwd=' in url:
        url, pwd = url.split('?pwd=')
        pwd = pwd.strip()
        
    try:
        # 添加任务 - storage.py 内部会处理调度器更新
        if storage.add_task(url, save_dir, pwd, name, cron, category):
            # 广播任务添加消息
            broadcast_message({
                'type': 'task_added',
                'data': {
                    'url': url,
                    'save_dir': save_dir,
                    'name': name,
                    'cron': cron,
                    'category': category
                }
            })
            
            return jsonify({'success': True, 'message': '添加任务成功'})
            
    except Exception as e:
        logger.error(f"添加任务失败: {str(e)}")
        return jsonify({'success': False, 'message': f'添加任务失败: {str(e)}'})

@app.route('/api/task/update', methods=['POST'])
@login_required
@handle_api_error
def update_task():
    """更新任务"""
    data = request.get_json()
    try:
        task_id = int(data.get('task_id', -1))
    except (TypeError, ValueError):
        return jsonify({'success': False, 'message': '无效的任务ID'})
    
    if not storage:
        return jsonify({'success': False, 'message': '存储未初始化'})
        
    tasks = storage.list_tasks()
    if not tasks:
        return jsonify({'success': False, 'message': '任务列表为空'})
        
    # 按order排序
    tasks.sort(key=lambda x: x.get('order', float('inf')))
    
    # 查找对应order的任务
    task_order = task_id + 1  # task_id 是从0开始的索引，而 order 是从1开始的
    task = None
    for t in tasks:
        if t.get('order') == task_order:
            task = t
            break
            
    if not task:
        return jsonify({'success': False, 'message': f'未找到任务(order={task_order})'})
    
    # 获取新的URL和密码
    new_url = data.get('url', '').strip()
    new_pwd = data.get('pwd', '').strip()
    
    # 如果URL中包含密码部分，提取出来
    if '?pwd=' in new_url:
        new_url, new_pwd = new_url.split('?pwd=')
        new_url = new_url.strip()
        new_pwd = new_pwd.strip()
    
    # 创建更新数据对象，保持原有状态
    update_data = {
        'url': new_url,
        'save_dir': data.get('save_dir', '').strip(),
        'pwd': new_pwd,  # 使用处理后的新密码
        'name': data.get('name', '').strip(),
        'cron': data.get('cron', '').strip(),
        'category': data.get('category', '').strip(),
        'order': task_order,  # 保持原有的order
        'status': task.get('status', 'normal'),  # 保持原有的状态
        'message': task.get('message', ''),  # 保持原有的消息
        'last_update': int(time.time())  # 添加更新时间戳
    }
    
    # 验证必填字段
    if not update_data['url']:
        return jsonify({'success': False, 'message': '分享链接不能为空'})
    if not update_data['save_dir']:
        return jsonify({'success': False, 'message': '保存目录不能为空'})
        
    try:
        # 更新任务
        success = storage.update_task_by_order(task_order, update_data)
        if not success:
            return jsonify({'success': False, 'message': '更新任务失败'})
        
        # 只在成功时广播一次
        broadcast_message({
            'type': 'task_updated',
            'data': {
                'task_id': task_id,
                'task': update_data
            }
        })
        
        return jsonify({
            'success': True, 
            'message': '更新任务成功',
            'task': update_data
        })
    except Exception as e:
        logger.error(f"更新任务失败: {str(e)}")
        return jsonify({'success': False, 'message': f'更新任务失败: {str(e)}'})

@app.route('/api/task/delete', methods=['POST'])
@login_required
@handle_api_error
def delete_task():
    """删除任务"""
    data = request.get_json()
    task_id = data.get('task_id')
    
    if not storage:
        return jsonify({'success': False, 'message': '存储未初始化'})
    tasks = storage.list_tasks()
    # 按 order 排序，确保 task_id 对应正确的任务
    tasks.sort(key=lambda x: x.get('order', float('inf')))
    if 0 <= task_id < len(tasks):
        task = tasks[task_id]
        task_order = task.get('order', task_id + 1)
        if storage.remove_task_by_order(task_order):
            # 删除成功后重新整理剩余任务的顺序
            storage._update_task_orders()
            return jsonify({'success': True, 'message': '删除任务成功'})
    return jsonify({'success': False, 'message': '任务不存在'})

def broadcast_task_log(message, type='info'):
    """广播任务日志"""
    broadcast_message({
        'type': 'task_log',
        'data': {
            'message': message,
            'type': type,
            'timestamp': int(time.time() * 1000)
        }
    })

def broadcast_task_progress(task_id, progress, status):
    """广播任务进度"""
    broadcast_message({
        'type': 'task_progress',
        'data': {
            'task_id': task_id,
            'progress': progress,
            'status': status
        }
    })

def broadcast_task_status(task_id, status, message=None):
    """广播任务状态"""
    broadcast_message({
        'type': 'task_status',
        'data': {
            'task_id': task_id,
            'status': status,
            'message': message
        }
    })

@app.route('/api/task/execute', methods=['POST'])
@login_required
@handle_api_error
def execute_task():
    """执行指定的任务"""
    data = request.get_json()
    
    # 获取并验证task_id
    try:
        task_id = int(data.get('task_id', -1))
    except (TypeError, ValueError):
        return jsonify({'success': False, 'message': '无效的任务ID'})
    
    if not storage:
        return jsonify({'success': False, 'message': '存储未初始化'})

    # 获取任务列表
    tasks = storage.list_tasks()
    if not tasks:
        return jsonify({'success': False, 'message': '任务列表为空'})
    
    # 按order排序
    tasks.sort(key=lambda x: x.get('order', float('inf')))
    
    # 查找对应的任务
    task = None
    task_order = task_id + 1  # 前端task_id从0开始，order从1开始
    
    for t in tasks:
        if t.get('order') == task_order:
            task = t
            break
    
    if not task:
        return jsonify({'success': False, 'message': f'未找到任务(order={task_order})'})
    
    task_name = task.get('name') or f'任务{task_order}'
    
    # 更新为运行状态
    storage.update_task_status_by_order(task_order, 'running', '正在执行任务')
    broadcast_task_log(f'开始执行任务: {task_name}', 'info')
    broadcast_task_progress(task_id, 0, 'running')
    
    try:
        def progress_callback(status, message):
            broadcast_task_log(message, status)
            if status == 'info' and message.startswith('添加文件:'):
                broadcast_task_progress(task_id, 50, 'running')
            elif status == 'info' and '正在转存' in message:
                broadcast_task_progress(task_id, 75, 'running')

        result = storage.transfer_share(
            task['url'],
            task.get('pwd'),
            None,
            task.get('save_dir'),
            progress_callback
        )
        
        if result.get('success'):
            transferred_files = result.get('transferred_files', [])
            if transferred_files:
                task_results = {
                    'success': [task],
                    'failed': [],
                    'transferred_files': {task['url']: transferred_files}
                }
                notify_send('百度自动追更', generate_transfer_notification(task_results))
                
                storage.update_task_status_by_order(
                    task_order, 
                    'normal',
                    '转存成功',
                    transferred_files=transferred_files
                )
                
                broadcast_task_log('转存成功', 'success')
                broadcast_task_progress(task_id, 100, 'normal')
                
                return jsonify({
                    'success': True, 
                    'message': '任务执行成功',
                    'transferred_files': transferred_files
                })
            else:
                storage.update_task_status_by_order(task_order, 'normal', '没有新文件需要转存')
                broadcast_task_log('没有新文件需要转存', 'info')
                broadcast_task_progress(task_id, 100, 'normal')
                return jsonify({'success': True, 'message': '没有新文件需要转存'})
        else:
            error_msg = result.get('error', '转存失败')
            storage.update_task_status_by_order(task_order, 'error', error_msg)
            broadcast_task_log(f'执行失败: {error_msg}', 'error')
            broadcast_task_progress(task_id, 100, 'error')
            return jsonify({'success': False, 'message': error_msg})

    except Exception as e:
        error_msg = str(e)
        is_share_forbidden = "error_code: 115" in error_msg
        
        if is_share_forbidden:
            error_msg = "该分享链接已失效（文件禁止分享）"
            try:
                storage.remove_task_by_order(task_order)
                storage._update_task_orders()
                broadcast_task_log(f"已自动删除失效的任务: {task_name}", 'warning')
            except Exception as del_err:
                broadcast_task_log(f"删除失效任务失败: {str(del_err)}", 'error')
        
        storage.update_task_status_by_order(task_order, 'error', error_msg)
        broadcast_task_log(f'执行出错: {error_msg}', 'error')
        broadcast_task_progress(task_id, 100, 'error')
        return jsonify({'success': False, 'message': error_msg})

@app.route('/api/users', methods=['GET'])
@login_required
@handle_api_error
def get_users():
    """获取所有用户"""
    if not storage:
        return jsonify({'success': False, 'message': '存储未初始化'})
    users = storage.list_users()
    return jsonify({'success': True, 'users': users})

@app.route('/api/user/add', methods=['POST'])
@login_required
@handle_api_error
def add_user():
    """添加用户"""
    data = request.get_json()
    username = data.get('username', '').strip()
    cookies = data.get('cookies', '').strip()
    
    if not username or not cookies:
        return jsonify({'success': False, 'message': '用户名和cookies不能为空'})
        
    if storage.add_user_from_cookies(cookies, username):
        init_app()
        return jsonify({'success': True, 'message': '添加用户成功'})
    return jsonify({'success': False, 'message': '添加用户失败'})

@app.route('/api/user/switch', methods=['POST'])
@login_required
@handle_api_error
def switch_user():
    """切换用户"""
    data = request.get_json()
    username = data.get('username')
    
    if not username:
        return jsonify({'success': False, 'message': '用户名不能为空'})
        
    if storage.switch_user(username):
        init_app()
        return jsonify({'success': True, 'message': '切换用户成功'})
    return jsonify({'success': False, 'message': '切换用户失败'})

@app.route('/api/user/delete', methods=['POST'])
@login_required
@handle_api_error
def delete_user():
    """删除用户"""
    data = request.get_json()
    username = data.get('username')
    
    if not username:
        return jsonify({'success': False, 'message': '用户名不能为空'})
        
    current_user = storage.config['baidu'].get('current_user')
    if current_user == username:
        return jsonify({'success': False, 'message': '不能删除当前使用的用户'})
        
    if storage.remove_user(username):
        return jsonify({'success': True, 'message': '删除用户成功'})
    return jsonify({'success': False, 'message': '删除用户失败'})

@app.route('/api/config', methods=['GET'])
@login_required
@handle_api_error
def get_config():
    """获取配置"""
    if not storage:
        return jsonify({'success': False, 'message': '存储未初始化'})
    config = {
        'cron': storage.config.get('cron', {}),
        'notify': storage.config.get('notify', {}),
        'scheduler': storage.config.get('scheduler', {}),
        'baidu': {
            'current_user': storage.config.get('baidu', {}).get('current_user')
        }
    }
    return jsonify({'success': True, 'config': config})

@app.route('/api/config/update', methods=['POST'])
@login_required
@handle_api_error
def update_config():
    """更新配置"""
    if not storage:
        return jsonify({'success': False, 'message': '存储未初始化'})
        
    data = request.get_json()
    storage.config.update(data)
    storage._save_config()
    
    if scheduler and ('cron' in data or 'scheduler' in data):
        try:
            was_running = scheduler.is_running
            if was_running:
                scheduler.stop()
                logger.info('调度器已停止')
            
            # 重新初始化调度器
            scheduler._init_scheduler()
            
            # 如果之前在运行，或者配置中指定了自动启动，则启动调度器
            should_start = was_running or data.get('cron', {}).get('auto_install', True)
            if should_start and not scheduler.is_running:
                scheduler.start()
                logger.info('调度器已重新启动')
            
            logger.info('调度器配置已更新')
        except Exception as e:
            logger.error(f'更新调度器配置失败: {str(e)}')
            return jsonify({
                'success': False,
                'message': f'配置已保存，但更新调度器失败: {str(e)}'
            })
    
    return jsonify({'success': True, 'message': '更新配置成功'})

@app.route('/api/notify/test', methods=['POST'])
@login_required
@handle_api_error
def test_notify():
    """测试通知功能"""
    if not storage or not storage.config.get('notify', {}).get('enabled'):
        return jsonify({'success': False, 'message': '通知功能未启用'})
        
    try:
        notify_send('百度网盘自动追更', '这是一条测试通知,如果你收到了这条消息,说明通知配置正确!')
        return jsonify({'success': True, 'message': '测试通知已发送'})
    except Exception as e:
        return jsonify({'success': False, 'message': f'发送测试通知失败: {str(e)}'})

@app.route('/api/tasks/execute-all', methods=['POST'])
@login_required
@handle_api_error
def execute_all_tasks():
    """批量执行任务"""
    if not storage:
        return jsonify({'success': False, 'message': '存储未初始化'})
        
    data = request.get_json()
    task_ids = data.get('task_ids', [])
    
    if not task_ids:
        return jsonify({'success': False, 'message': '没有指定要执行的任务'})
    
    # 将task_ids转换为orders
    task_orders = [task_id + 1 for task_id in task_ids]
    
    # 获取并按order排序的任务列表
    tasks = storage.list_tasks()
    if not tasks:
        return jsonify({'success': False, 'message': '任务列表为空'})
    
    tasks.sort(key=lambda x: x.get('order', float('inf')))
    
    # 找出要执行的任务
    selected_tasks = [task for task in tasks if task.get('order') in task_orders]
    
    if not selected_tasks:
        return jsonify({'success': False, 'message': '未找到指定的任务'})
    
    results = {
        'success': [],
        'skipped': [],
        'failed': [],
        'transferred_files': {}
    }
    
    for task in selected_tasks:
        task_order = task.get('order')
        if not task_order:
            continue
            
        try:
            result = storage.transfer_share(
                task['url'],
                task.get('pwd'),
                None,
                task.get('save_dir')
            )
            
            if result.get('success'):
                if result.get('skipped'):
                    results['skipped'].append(task)
                    storage.update_task_status_by_order(task_order, 'skipped', '没有新文件需要转存')
                else:
                    transferred_files = result.get('transferred_files', [])
                    if transferred_files:
                        results['success'].append(task)
                        results['transferred_files'][task['url']] = transferred_files
                        storage.update_task_status_by_order(
                            task_order, 
                            'success',
                            '转存成功',
                            transferred_files=transferred_files
                        )
                    else:
                        results['skipped'].append(task)
                        storage.update_task_status_by_order(task_order, 'skipped', '没有新文件需要转存')
            else:
                error_msg = result.get('error', '转存失败')
                results['failed'].append(task)
                storage.update_task_status_by_order(task_order, 'failed', error_msg)
                
        except Exception as e:
            error_msg = str(e)
            if "error_code: 115" in error_msg:
                error_msg = "该分享链接已失效（文件禁止分享）"
                try:
                    storage.remove_task_by_order(task_order)
                except Exception as del_err:
                    logger.error(f"删除失效任务失败: {str(del_err)}")
            results['failed'].append(task)
            storage.update_task_status_by_order(task_order, 'failed', error_msg)
    
    # 发送通知
    if results['success'] or results['failed']:
        try:
            notification_content = generate_transfer_notification(results)
            notify_send("百度网盘自动追更", notification_content)
        except Exception as e:
            logger.error(f"发送通知失败: {str(e)}")
    
    return jsonify({
        'success': True,
        'message': f'批量执行完成，成功: {len(results["success"])}，跳过: {len(results["skipped"])}，失败: {len(results["failed"])}',
        'results': results
    })

@app.route('/api/categories', methods=['GET'])
@login_required
@handle_api_error
def get_categories():
    """获取所有任务分类"""
    if not storage:
        return jsonify({'success': False, 'message': '存储未初始化'})
    categories = storage.get_task_categories()
    return jsonify({'success': True, 'categories': categories})

@app.route('/api/tasks/category/<category>', methods=['GET'])
@login_required
@handle_api_error
def get_tasks_by_category(category):
    """获取指定分类的任务"""
    if not storage:
        return jsonify({'success': False, 'message': '存储未初始化'})
        
    if category == 'uncategorized':
        tasks = storage.get_tasks_by_category(None)
    else:
        tasks = storage.get_tasks_by_category(category)
    
    # 按 order 排序
    tasks.sort(key=lambda x: x.get('order', float('inf')))
    return jsonify({'success': True, 'tasks': tasks})

@app.route('/api/notify/fields', methods=['POST'])
@login_required
@handle_api_error
def add_notify_field():
    """添加自定义通知字段"""
    if not storage:
        return jsonify({'success': False, 'message': '存储未初始化'})
        
    data = request.get_json()
    field_name = data.get('name', '').strip()
    field_value = data.get('value', '').strip()
    
    if not field_name:
        return jsonify({'success': False, 'message': '字段名称不能为空'})
        
    notify_config = storage.config.get('notify', {})
    if 'custom_fields' not in notify_config:
        notify_config['custom_fields'] = {}
        
    notify_config['custom_fields'][field_name] = field_value
    storage.config['notify'] = notify_config
    storage._save_config()
    
    return jsonify({'success': True, 'message': '添加通知字段成功'})

@app.route('/api/task/reorder', methods=['POST'])
@login_required
@handle_api_error
def reorder_task():
    """重新排序任务"""
    if not storage:
        return jsonify({'success': False, 'message': '存储未初始化'})
        
    data = request.get_json()
    task_id = data.get('task_id')
    new_order = data.get('new_order')
    
    if task_id is None or new_order is None:
        return jsonify({'success': False, 'message': '任务ID和新顺序不能为空'})
    
    # 将task_id转换为order
    task_order = task_id + 1
        
    if storage.reorder_task(task_order, new_order):
        return jsonify({'success': True, 'message': '任务重排序成功'})
    return jsonify({'success': False, 'message': '任务重排序失败'})

@app.route('/ws')
def ws():
    """WebSocket连接处理"""
    if request.environ.get('wsgi.websocket'):
        ws = request.environ['wsgi.websocket']
        clients.add(ws)
        try:
            # 设置WebSocket连接的ping_interval和ping_timeout
            ws.stream.handler.socket.setsockopt(socket.SOL_SOCKET, socket.SO_KEEPALIVE, 1)
            ws.stream.handler.socket.setsockopt(socket.IPPROTO_TCP, socket.TCP_KEEPIDLE, 30)
            ws.stream.handler.socket.setsockopt(socket.IPPROTO_TCP, socket.TCP_KEEPINTVL, 10)
            ws.stream.handler.socket.setsockopt(socket.IPPROTO_TCP, socket.TCP_KEEPCNT, 3)

            last_ping = time.time()
            while True:
                # 每30秒发送一次ping
                if time.time() - last_ping > 30:
                    ws.send(json.dumps({'type': 'ping'}))
                    last_ping = time.time()
                
                message = ws.receive()
                if message is None:
                    break
                    
                # 处理客户端的pong响应
                try:
                    data = json.loads(message)
                    if data.get('type') == 'pong':
                        continue
                except:
                    pass
                    
        except WebSocketError as e:
            logger.warning(f"WebSocket错误: {str(e)}")
        except Exception as e:
            logger.error(f"WebSocket异常: {str(e)}")
        finally:
            try:
                clients.remove(ws)
            except:
                pass
    return ''

# 静态文件路由
@app.route('/static/<path:path>')
def send_static(path):
    return send_from_directory('static', path)

# 错误处理
@app.errorhandler(404)
def not_found(error):
    return jsonify({'success': False, 'message': '接口不存在'}), 404

@app.errorhandler(405)
def method_not_allowed(error):
    return jsonify({'success': False, 'message': '请求方法不允许'}), 405

@app.errorhandler(500)
def internal_error(error):
    return jsonify({'success': False, 'message': '服务器内部错误'}), 500

def signal_handler(signum, frame):
    """处理退出信号"""
    logger.info("接收到退出信号，正在清理...")
    try:
        cleanup()
    except Exception as e:
        logger.error(f"清理过程出错: {str(e)}")
    finally:
        logger.info("清理完成，正在退出...")
        sys.exit(0)

@app.route('/api/scheduler/reload', methods=['POST'])
@login_required
def reload_scheduler():
    """重新加载调度器，使配置更改生效"""
    try:
        was_running = scheduler.is_running
        if was_running:
            scheduler.stop()
            logger.info('调度器已停止')
        
        # 重新初始化调度器
        scheduler._init_scheduler()
        
        # 如果之前在运行，则重新启动
        if was_running and not scheduler.is_running:
            scheduler.start()
            logger.info('调度器已重新启动')
        
        logger.info('调度器已重新加载')
        return jsonify({
            'success': True,
            'message': '调度器已重新加载'
        })
    except Exception as e:
        logger.error(f'重新加载调度器失败: {str(e)}')
        return jsonify({
            'success': False,
            'message': f'重新加载调度器失败: {str(e)}'
        }), 500

@app.route('/api/tasks/batch-delete', methods=['POST'])
@login_required
@handle_api_error
def batch_delete_tasks():
    """批量删除任务"""
    data = request.get_json()
    task_ids = data.get('task_ids', [])
    
    if not storage:
        return jsonify({'success': False, 'message': '存储未初始化'})
        
    if not task_ids:
        return jsonify({'success': False, 'message': '没有指定要删除的任务'})
    
    try:
        # 将task_ids转换为orders（task_id + 1）
        task_orders = [task_id + 1 for task_id in task_ids]
        
        # 批量删除任务
        deleted_count = storage.remove_tasks(task_orders)
        
        if deleted_count > 0:
            return jsonify({
                'success': True,
                'message': f'成功删除{deleted_count}个任务'
            })
        else:
            return jsonify({
                'success': False,
                'message': '没有任务被删除'
            })
            
    except Exception as e:
        error_msg = str(e)
        logger.error(f"批量删除任务失败: {error_msg}")
        return jsonify({
            'success': False,
            'message': f'批量删除任务失败: {error_msg}'
        })

@app.route('/api/auth/update', methods=['POST'])
@login_required
@handle_api_error
def update_auth():
    """更新登录凭据"""
    if not storage:
        return jsonify({'success': False, 'message': '存储未初始化'})
        
    data = request.get_json()
    new_username = data.get('username', '').strip()
    new_password = data.get('password', '').strip()
    old_password = data.get('old_password', '').strip()
    
    if not new_username or not new_password or not old_password:
        return jsonify({'success': False, 'message': '用户名、新密码和旧密码都不能为空'})
    
    # 验证旧密码
    auth_config = storage.config.get('auth', {})
    if old_password != auth_config.get('password'):
        return jsonify({'success': False, 'message': '旧密码错误'})
    
    # 更新配置
    auth_config['users'] = new_username
    auth_config['password'] = new_password
    storage.config['auth'] = auth_config
    storage._save_config()
    
    return jsonify({'success': True, 'message': '登录凭据更新成功'})

if __name__ == '__main__':
    try:
        # 启动时初始化应用
        init_success, init_error = init_app()
        if not init_success:
            logger.error(f"应用初始化失败: {init_error}")
            if init_error:
                logger.warning("将继续启动 Web 界面，但部分功能可能不可用")
        
        # 注册信号处理器
        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)
        
        # 使用gevent-websocket替代默认的服务器
        http_server = WSGIServer(('0.0.0.0', 5000), app, handler_class=WebSocketHandler)
        print('Server started at http://0.0.0.0:5000')
        http_server.serve_forever()
    except KeyboardInterrupt:
        logger.info("接收到 Ctrl+C，正在退出...")
        signal_handler(signal.SIGINT, None)
    except Exception as e:
        logger.error(f"应用运行出错: {str(e)}")
        try:
            signal_handler(signal.SIGTERM, None)
        except:
            sys.exit(1) 