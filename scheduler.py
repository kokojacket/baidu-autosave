from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.executors.pool import ThreadPoolExecutor
from apscheduler.jobstores.memory import MemoryJobStore
from apscheduler.triggers.cron import CronTrigger
from storage import BaiduStorage
import json
import os
from loguru import logger
import sys
from notify import send as notify_send
from notify import push_config as notify_push_config
from utils import generate_transfer_notification
import time
from threading import Lock
import pytz
import datetime
import re

class TaskScheduler:
    instance = None
    
    def __init__(self, storage=None):
        # 修改为任务级别的锁字典，而不是全局锁
        self._execution_locks = {}
        # 添加任务队列字典
        self._task_queues = {}
        self.storage = storage or BaiduStorage()
        self.scheduler = None
        self.is_running = False
        
        # 初始化默认调度列表
        self.default_schedule = self.storage.config.get('cron', {}).get('default_schedule', [])
        if isinstance(self.default_schedule, str):
            self.default_schedule = [self.default_schedule]
        elif not isinstance(self.default_schedule, list):
            self.default_schedule = []
        
        self._init_scheduler()
        self._init_notify()
        TaskScheduler.instance = self
        
    def _get_current_tasks(self):
        """获取当前的任务列表"""
        try:
            # 重新加载配置以获取最新任务
            with open('config/config.json', 'r', encoding='utf-8') as f:
                config = json.load(f)
            return config['baidu']['tasks']
        except Exception as e:
            logger.error(f"获取任务列表失败: {str(e)}")
            return []

    def update_tasks(self):
        """更新所有任务的调度"""
        try:
            # 清除现有的任务调度
            self.scheduler.remove_all_jobs()
            
            # 获取任务列表
            tasks = self.storage.list_tasks()
            if not tasks:
                logger.info("没有任务需要调度")
                return
            
            # 获取默认调度设置
            default_schedule = self.storage.config.get('cron', {}).get('default_schedule', [])
            if isinstance(default_schedule, str):
                default_schedule = [default_schedule]
            elif not isinstance(default_schedule, list):
                default_schedule = []
            
            custom_count = 0
            default_count = 0
            
            # 添加任务调度
            for task in tasks:
                if task.get('cron'):  # 自定义定时
                    self.add_single_task(task)
                    custom_count += 1
                else:  # 使用默认定时
                    if not default_schedule:
                        logger.warning("存在使用默认定时的任务，但未配置默认定时规则")
                        continue
                    
                    # 为每个默认定时规则添加任务
                    for schedule in default_schedule:
                        if schedule and isinstance(schedule, str):  # 确保调度规则有效
                            self.add_single_task(task, schedule)
                            default_count += 1
            
            logger.info(f"任务调度更新完成: {custom_count} 个自定义定时任务, {default_count} 个默认定时任务")
            
        except Exception as e:
            logger.error(f"更新任务调度失败: {str(e)}")

    def start(self):
        """启动调度器"""
        try:
            if not self.scheduler:
                self._init_scheduler()
            
            # 直接启动调度器，因为任务已经在_init_scheduler中添加
            self.scheduler.start()
            self.is_running = True  # 设置运行状态
            logger.success("调度器已启动")
            
            current_time = datetime.datetime.now(pytz.timezone('Asia/Shanghai'))
            logger.info(f"当前时间: {current_time.strftime('%Y-%m-%d %H:%M:%S')}")
            
        except Exception as e:
            logger.error(f"启动调度器失败: {str(e)}")
            raise

    def _init_scheduler(self):
        """初始化调度器"""
        try:
            if self.scheduler and self.scheduler.running:
                self.scheduler.shutdown(wait=True)
                self.is_running = False  # 重置运行状态
            
            # 从 storage 获取调度器配置
            scheduler_config = self.storage.config.get('scheduler', {})
            
            # 使用单线程执行器
            executors = {
                'default': ThreadPoolExecutor(max_workers=scheduler_config.get('max_workers', 1))
            }
            
            # 配置作业存储
            jobstores = {
                'default': MemoryJobStore()
            }
            
            # 配置调度器
            job_defaults = {
                'coalesce': scheduler_config.get('coalesce', True),  # 堆积的任务只运行一次
                'max_instances': 1,  # 限制每个任务只能有一个实例，使用我们的队列机制来管理排队
                'misfire_grace_time': scheduler_config.get('misfire_grace_time', 3600)  # 错过执行的容错时间
            }
            
            # 创建调度器
            self.scheduler = BackgroundScheduler(
                executors=executors,
                jobstores=jobstores,
                job_defaults=job_defaults
            )
            self.is_running = False  # 初始化时设置为未运行状态
            
            # 获取任务列表
            tasks = self._get_current_tasks()
            if not tasks:
                logger.info("没有配置任何任务")
                return
            
            # 获取默认调度并处理多个cron表达式
            default_schedule = self.storage.config.get('cron', {}).get('default_schedule', '*/5 * * * *')
            
            # 处理默认调度配置
            cron_expressions = []
            if isinstance(default_schedule, list):
                # 如果是列表格式，直接使用
                schedule_list = default_schedule
            else:
                # 如果是字符串格式，按分号分割
                schedule_list = default_schedule.split(';')
            
            # 验证每个cron表达式
            for expr in schedule_list:
                expr = expr.strip()
                if not expr:
                    continue
                # 验证 cron 表达式格式
                parts = expr.split()
                if len(parts) == 5:  # 标准 cron 表达式应该有5个字段
                    cron_expressions.append(expr)
                else:
                    logger.error(f"无效的 cron 表达式 ({expr}): 必须包含5个字段")
            
            # 保存验证后的默认调度表达式
            self.default_schedule = cron_expressions
            
            # 分离自定义定时任务和默认定时任务
            custom_scheduled_tasks = [task for task in tasks if task.get('cron')]
            default_scheduled_tasks = [task for task in tasks if not task.get('cron')]
            
            # 添加自定义定时任务
            for task in custom_scheduled_tasks:
                try:
                    task_order = task.get('order')
                    if not task_order:
                        continue
                        
                    # 使用统一方法解析cron表达式
                    self.scheduler.add_job(
                        self._execute_single_task,
                        CronTrigger.from_crontab(convert_cron_weekday(task['cron']), timezone=pytz.timezone('Asia/Shanghai')),
                        args=[task],
                        id=f'task_{task_order - 1}',
                        replace_existing=True
                    )
                    logger.info(f"已添加自定义定时任务: {task.get('name', f'任务{task_order}')} -> {task['cron']}")
                except Exception as e:
                    logger.error(f"添加自定义定时任务失败 ({task.get('name', f'任务{task_order}')}): {str(e)}")
                    continue
            
            # 如果有使用默认定时的任务，添加默认定时任务
            if default_scheduled_tasks:
                for task in default_scheduled_tasks:
                    task_order = task.get('order')
                    if not task_order:
                        continue
                        
                    for i, cron_exp in enumerate(cron_expressions):
                        try:
                            self.scheduler.add_job(
                                self._execute_single_task,
                                CronTrigger.from_crontab(convert_cron_weekday(cron_exp), timezone=pytz.timezone('Asia/Shanghai')),
                                args=[task],
                                id=f'task_{task_order - 1}_{i}',
                                replace_existing=True
                            )
                            logger.info(f"已添加默认定时任务: {task.get('name', f'任务{task_order}')} -> {cron_exp}")
                        except Exception as e:
                            logger.error(f"添加默认定时任务失败 ({task.get('name', f'任务{task_order}')}): {str(e)}")
                            continue
            
            logger.info(f"调度器初始化完成: {len(custom_scheduled_tasks)} 个自定义定时任务, {len(default_scheduled_tasks)} 个默认定时任务")
            
        except Exception as e:
            logger.error(f"初始化调度器失败: {str(e)}")
            raise

    def _load_config(self):
        """加载配置文件"""
        try:
            with open('config/config.json', 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"加载配置文件失败: {str(e)}")
            return None
            
    def _save_config(self):
        """保存配置文件"""
        try:
            with open('config/config.json', 'w', encoding='utf-8') as f:
                json.dump(self.storage.config, f, ensure_ascii=False, indent=4)
        except Exception as e:
            logger.error(f"保存配置文件失败: {str(e)}")

    def _execute_task_group(self, tasks=None):
        """执行多个任务"""
        if not tasks:
            # 获取所有任务
            tasks = self._get_current_tasks()
            
        if not tasks:
            logger.info("没有任务需要执行")
            return
            
        success_count = 0
        error_count = 0
        
        # 初始化任务锁
        for task in tasks:
            task_url = task.get('url')
            if task_url and task_url not in self._execution_locks:
                self._execution_locks[task_url] = Lock()
                self._task_queues[task_url] = []
        
        for task in tasks:
            # 获取任务URL
            task_url = task.get('url')
            if not task_url:
                continue
                
            # 检查任务锁状态
            lock = self._execution_locks.get(task_url)
            if lock and lock.locked():
                logger.info(f"任务 {task.get('name', task_url)} 正在执行中，已加入队列")
                # 将任务加入队列
                task_queue = self._task_queues.get(task_url, [])
                task_queue.append(task)
                self._task_queues[task_url] = task_queue
                continue
                
            try:
                result = self._execute_single_task(task)
                if result:
                    success_count += 1
                else:
                    error_count += 1
            except Exception as e:
                logger.error(f"执行任务 {task.get('name', task_url)} 时出错: {str(e)}")
                error_count += 1
                
        logger.info(f"任务组执行完成: {success_count} 个成功, {error_count} 个失败")
        return success_count, error_count
        
    def _execute_single_task(self, task):
        """执行单个任务"""
        # 获取任务URL
        task_url = task.get('url')
        if not task_url:
            logger.error("任务URL为空")
            return False
            
        task_name = task.get('name', task_url)
        task_order = task.get('order')
            
        # 检查任务是否已经在运行
        lock = self._execution_locks.get(task_url)
        if lock and lock.locked():
            logger.info(f"任务 {task_name} 正在执行中，已加入队列")
            # 将任务加入队列
            task_queue = self._task_queues.get(task_url, [])
            task_queue.append(task)
            self._task_queues[task_url] = task_queue
            return False
            
        # 如果没有锁，则创建一个
        if not lock:
            lock = Lock()
            self._execution_locks[task_url] = lock
            self._task_queues[task_url] = []
            
        # 尝试获取锁
        if not lock.acquire(False):
            logger.info(f"无法获取任务 {task_name} 的锁，任务可能正在执行")
            return False
            
        # 获取到锁，执行任务
        try:
            # 更新任务状态为运行中
            self._update_task_status(task_url, 'running')
            
            # 定义进度回调
            def progress_callback(status, msg):
                """任务进度回调函数"""
                if status == 'progress':
                    # 这是进度更新
                    logger.info(f"任务 {task_name} 进度: {msg}")
                    
                    # 更新任务状态，但不修改状态字段
                    if isinstance(msg, dict):
                        progress = msg.get('progress', 0)
                        status_text = msg.get('status', '')
                        self.storage.update_task_status_by_order(
                            task_order, 
                            'running', 
                            f"执行中: {status_text} - {progress}%",
                            transferred_files=msg.get('transferred_files', [])
                        )
                else:
                    # 这是日志消息
                    logger.info(f"任务 {task_name} {status}: {msg}")
            
            # 获取任务参数
            save_dir = task.get('save_dir')
            pwd = task.get('pwd')
            file_filters = task.get('file_filters')
            rename_rules = task.get('rename_rules')
            
            # 执行转存任务
            logger.info(f"开始执行任务: {task_name}")
            result = self.storage.transfer_share(
                share_url=task_url,
                pwd=pwd,
                save_dir=save_dir,
                progress_callback=progress_callback,
                file_filters=file_filters,
                rename_rules=rename_rules
            )
            
            # 解析结果
            if result and isinstance(result, dict):
                success = result.get('success', False)
                message = result.get('message', '')
                transferred_files = result.get('transferred_files', [])
                
                if success:
                    status = 'skipped' if result.get('skipped') else 'completed'
                    logger.info(f"任务 {task_name} 执行成功: {message}")
                    
                    # 更新任务状态
                    self._update_task_status(
                        task_url, 
                        status, 
                        message,
                        transferred_files=transferred_files
                    )
                    
                    # 发送通知
                    try:
                        notify_text = generate_transfer_notification(task, transferred_files)
                        notify_send(notify_text)
                    except Exception as e:
                        logger.error(f"发送通知失败: {str(e)}")
                    
                    return True
                else:
                    logger.error(f"任务 {task_name} 执行失败: {message}")
                    # 更新任务状态
                    self._update_task_status(task_url, 'error', message)
                    return False
            else:
                logger.error(f"任务 {task_name} 返回无效结果")
                # 更新任务状态
                self._update_task_status(task_url, 'error', '任务返回无效结果')
                return False
                
        except Exception as e:
            logger.error(f"执行任务 {task_name} 时出错: {str(e)}")
            # 更新任务状态
            self._update_task_status(task_url, 'error', str(e))
            return False
            
        finally:
            # 释放锁
            lock.release()
            
            # 检查任务队列
            task_queue = self._task_queues.get(task_url, [])
            if task_queue:
                # 取出队列中的下一个任务
                next_task = task_queue.pop(0)
                self._task_queues[task_url] = task_queue
                
                # 递归执行下一个任务
                logger.info(f"执行队列中的下一个任务: {next_task.get('name', task_url)}")
                self._execute_single_task(next_task)

    def stop(self):
        """停止调度器"""
        try:
            if self.scheduler and self.scheduler.running:
                self.scheduler.shutdown(wait=False)
                self.is_running = False
                logger.info("调度器已停止")
            else:
                logger.info("调度器未运行，无需停止")
        except Exception as e:
            logger.error(f"停止调度器时出错: {str(e)}")
    
    def update_task(self, task_url, cron_exp):
        """更新任务的调度时间
        Args:
            task_url: 任务URL
            cron_exp: 新的cron表达式
        """
        try:
            # 更新配置文件
            tasks = self.storage.config.get('baidu', {}).get('tasks', [])
            for task in tasks:
                if task.get('url') == task_url:
                    task['cron'] = cron_exp
                    task_order = task.get('order')
                    if task_order:
                        # 使用统一的任务ID格式
                        job_id = f"task_{task_order - 1}"
                        if self.scheduler.get_job(job_id):
                            self.scheduler.reschedule_job(
                                job_id,
                                trigger=CronTrigger.from_crontab(convert_cron_weekday(cron_exp), timezone=pytz.timezone('Asia/Shanghai'))
                            )
                            logger.success(f"已更新任务调度: {task_url} -> {cron_exp}")
                    break
            self._save_config()
            
        except Exception as e:
            logger.error(f"更新任务调度失败: {str(e)}")

    def update_default_schedule(self, schedules):
        """更新默认调度规则
        Args:
            schedules: 调度规则列表或字符串(多个规则用分号分隔)
        """
        try:
            if isinstance(schedules, str):
                schedules = [s.strip() for s in schedules.split(';') if s.strip()]
            
            # 更新本地变量
            self.default_schedule = schedules
            
            # 更新存储中的配置
            if 'cron' not in self.storage.config:
                self.storage.config['cron'] = {}
            self.storage.config['cron']['default_schedule'] = schedules
            self._save_config()
            
            # 重新调度任务
            self.update_tasks()
            logger.info(f"已更新默认调度规则: {schedules}")
            return True
        except Exception as e:
            logger.error(f"更新默认调度规则失败: {str(e)}")
            return False

    def remove_task(self, task_url):
        """从调度器中移除任务
        Args:
            task_url: 任务URL
        """
        try:
            # 先查找任务的order
            tasks = self.storage.config.get('baidu', {}).get('tasks', [])
            task = next((t for t in tasks if t.get('url') == task_url), None)
            
            if task and task.get('order'):
                task_order = task.get('order')
                base_job_id = f"task_{task_order - 1}"
                
                # 移除主任务
                if self.scheduler.get_job(base_job_id):
                    self.scheduler.remove_job(base_job_id)
                
                # 移除可能存在的默认定时任务(带索引)
                for i in range(10):  # 假设最多10个默认定时
                    job_id = f"{base_job_id}_{i}"
                    if self.scheduler.get_job(job_id):
                        self.scheduler.remove_job(job_id)
                
                logger.success(f"已移除任务: {task_url}")
            else:
                logger.warning(f"未找到要移除的任务: {task_url}")
        except Exception as e:
            logger.error(f"移除任务失败: {str(e)}")

    def _init_notify(self):
        """初始化通知配置"""
        try:
            notify_config = self.storage.config.get('notify', {})
            if notify_config and notify_config.get('enabled'):
                # 更新推送配置
                from notify import push_config, send as notify_send
                
                # 将通知配置应用到push_config
                # 1. 处理直接字段 (新格式)
                if 'direct_fields' in notify_config:
                    for key, value in notify_config.get('direct_fields', {}).items():
                        push_config[key] = value
                    logger.info("已加载直接通知字段配置")
                
                # 2. 处理通道结构 (旧格式，向后兼容)
                elif 'channels' in notify_config:
                    for channel, config in notify_config.get('channels', {}).items():
                        if channel == 'pushplus':
                            # 设置token
                            push_config['PUSH_PLUS_TOKEN'] = config.get('token')
                            # 如果有topic则设置，没有也不影响功能
                            if 'topic' in config:
                                push_config['PUSH_PLUS_USER'] = config.get('topic')
                    logger.info("已加载通道格式的通知配置")
                
                # 3. 处理自定义字段 (兼容旧版本)
                if 'custom_fields' in notify_config:
                    for key, value in notify_config.get('custom_fields', {}).items():
                        push_config[key] = value
                    logger.info("已加载自定义通知字段配置")
                
                logger.info("通知配置已加载完成")
            else:
                logger.debug("通知功能未启用")
        except Exception as e:
            logger.error(f"初始化通知配置失败: {str(e)}")

    def update_notify_config(self, notify_config):
        """更新通知配置"""
        if not self.config:
            self.config = {}
        self.config['notify'] = notify_config
        self._save_config()
        self._init_notify()
        logger.info("通知配置已更新")

    def _update_task_status(self, task_url, status, error_msg=''):
        """更新任务状态"""
        try:
            self.storage.update_task_status(task_url, status, message=error_msg)
            logger.info(f"任务状态更新为: {status}")
        except Exception as e:
            logger.error(f"更新任务状态失败: {str(e)}")

    def update_task_schedule(self, task_url, cron_exp=None):
        """更新任务调度"""
        try:
            tasks = self.storage.config['baidu']['tasks']
            current_task = next((task for task in tasks if task['url'] == task_url), None)
            
            if not current_task:
                logger.error(f"未找到任务: {task_url}")
                return False
                
            task_order = current_task.get('order')
            if not task_order:
                logger.error(f"任务缺少order: {task_url}")
                return False
            
            task_id = f'task_{task_order - 1}'  # 转换为前端使用的task_id
            
            # 移除旧任务
            if self.scheduler.get_job(task_id):
                self.scheduler.remove_job(task_id)
            
            # 使用新的cron表达式或保持原值
            final_cron = cron_exp if cron_exp is not None else current_task.get('cron')
            
            if final_cron:
                try:
                    self.scheduler.add_job(
                        self._execute_single_task,
                        CronTrigger.from_crontab(convert_cron_weekday(final_cron)),
                        args=[current_task],
                        id=task_id,
                        replace_existing=True
                    )
                    logger.info(f"已更新任务调度: {task_url} (task_id={task_order}) -> {final_cron}")
                except Exception as e:
                    logger.error(f"更新任务调度失败: {str(e)}")
                    return False
            else:
                logger.info(f"任务 {task_url} 切换到默认定时，正在更新调度...")
                self.update_tasks()  # 重新加载所有任务的调度
            
            return True
            
        except Exception as e:
            logger.error(f"更新任务调度失败: {str(e)}")
            return False

    def sync_task_info(self, task_url):
        """同步任务信息
        Args:
            task_url: 任务的URL
        Returns:
            bool: 是否成功
        """
        try:
            # 获取最新的任务信息
            tasks = self.storage.config['baidu']['tasks']
            current_task = next((task for task in tasks if task['url'] == task_url), None)
            
            if not current_task:
                logger.error(f"未找到任务: {task_url}")
                return False
            
            # 更新任务调度
            return self.update_task_schedule(task_url, current_task.get('cron'))
            
        except Exception as e:
            logger.error(f"同步任务信息失败: {str(e)}")
            return False

    def add_single_task(self, task, schedule=None):
        """添加单个任务的调度
        Args:
            task: 任务配置
            schedule: 可选的定时规则，用于默认定时
        """
        try:
            cron_schedule = schedule or task.get('cron')
            if not cron_schedule:
                return
                
            task_order = task.get('order')
            if not task_order:
                logger.error(f"任务缺少order: {task.get('name', task.get('url', '未知任务'))}")
                return
                
            task_id = task_order - 1
            
            try:
                # 使用统一方法解析cron表达式
                trigger = CronTrigger.from_crontab(convert_cron_weekday(cron_schedule), timezone=pytz.timezone('Asia/Shanghai'))

                # 为默认定时任务添加索引
                job_id = f'task_{task_id}'
                if schedule:  # 使用默认定时
                    # 查找已有的默认定时任务数量
                    count = 0
                    while self.scheduler.get_job(f'{job_id}_{count}'):
                        count += 1
                    job_id = f'{job_id}_{count}'
                
                self.scheduler.add_job(
                    self._execute_single_task,
                    trigger,
                    args=[task],
                    id=job_id,
                    replace_existing=True
                )
                
                # 根据schedule参数判断是默认定时还是自定义定时
                schedule_type = "默认定时" if schedule else "自定义定时"
                logger.info(f"已添加{schedule_type}任务: {task.get('name', task.get('url', f'任务{task_order}'))}, 调度: {cron_schedule}")
            except Exception as e:
                logger.error(f"解析cron表达式失败 '{cron_schedule}': {str(e)}")
        except Exception as e:
            logger.error(f"添加任务调度失败 ({task.get('name', task.get('url', '未知任务'))}): {str(e)}")

    def _sort_task_queue(self, task_order):
        """按order排序任务队列
        Args:
            task_order: 任务order
        """
        if task_order in self._task_queues and len(self._task_queues[task_order]) > 1:
            # 按任务的order属性排序，order值小的优先级高
            self._task_queues[task_order].sort(key=lambda t: t.get('order', 999))
            logger.info(f"任务队列已排序，当前队列长度: {len(self._task_queues[task_order])}")

def convert_cron_weekday(cron_exp):
    """
    转换cron表达式中的星期几字段，适配APScheduler的映射规则
    标准cron: 0或7=周日, 1=周一, ..., 6=周六
    APScheduler: 0=周一, 1=周二, ..., 6=周日
    
    转换规则:
    - 使用英文简写 (sun, mon, tue, wed, thu, fri, sat) 不变
    - 数字 0 转为 6 (周日)
    - 数字 7 转为 6 (周日)
    - 数字 1-6 转为 0-5 (周一到周六，减1)
    """
    if not cron_exp or not isinstance(cron_exp, str):
        return cron_exp
        
    parts = cron_exp.strip().split()
    if len(parts) != 5:  # 标准cron表达式有5个字段
        return cron_exp
        
    dow_field = parts[4]  # 第5个字段是星期几 (0-7)
    
    # 如果包含英文简写，不做转换
    if re.search(r'[a-zA-Z]', dow_field):
        return cron_exp
    
    # 处理复杂表达式 (例如: 1-5,0 或 */2)
    new_dow = []
    for item in dow_field.split(','):
        if '/' in item:  # 处理 */2 这样的格式
            interval_parts = item.split('/')
            if interval_parts[0] == '*':
                new_dow.append(item)  # 保持不变
            else:
                # 这里可能需要更复杂的处理，暂时保持不变
                new_dow.append(item)
        elif '-' in item:  # 处理 1-5 这样的范围
            range_parts = item.split('-')
            start = int(range_parts[0])
            end = int(range_parts[1])
            # 转换范围边界
            if start == 0 or start == 7:  # 0和7都表示周日
                start = 6  # APScheduler中6表示周日
            else:
                start = start - 1  # 其他天减1
                
            if end == 0 or end == 7:  # 0和7都表示周日
                end = 6  # APScheduler中6表示周日
            else:
                end = end - 1  # 其他天减1
                
            new_dow.append(f"{start}-{end}")
        else:  # 处理单个数字
            try:
                day = int(item)
                if day == 0 or day == 7:  # 0和7都表示周日
                    new_dow.append('6')  # APScheduler中6表示周日
                else:
                    new_dow.append(str(day - 1))  # 其他天减1
            except ValueError:
                new_dow.append(item)  # 非数字，保持不变
    
    # 替换原表达式中的星期几字段
    parts[4] = ','.join(new_dow)
    return ' '.join(parts)

def main():
    """命令行入口"""
    import argparse
    import time
    
    parser = argparse.ArgumentParser(description='定时任务管理工具')
    parser.add_argument('action', choices=['start', 'stop', 'update-task', 'update-default'],
                       help='要执行的操作')
    parser.add_argument('--cron', help='新的cron表达式')
    parser.add_argument('--url', help='要更新的任务URL')
    
    args = parser.parse_args()
    scheduler = TaskScheduler()
    
    if args.action == 'start':
        scheduler.start()
        try:
            # 保持程序运行
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            scheduler.stop()
    elif args.action == 'stop':
        scheduler.stop()
    elif args.action == 'update-task':
        if not args.url or not args.cron:
            logger.error("更新任务需要提供任务URL和新的cron表达式")
            return
        scheduler.update_task(args.url, args.cron)
    elif args.action == 'update-default':
        if not args.cron:
            logger.error("更新默认调度需要提供新的cron表达式")
            return
        scheduler.update_default_schedule(args.cron)

if __name__ == '__main__':
    main() 