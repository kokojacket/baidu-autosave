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
import eventlet  # 添加 eventlet 导入

class TaskScheduler:
    instance = None
    
    def __init__(self, storage=None):
        self._execution_lock = Lock()
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

    def add_single_task(self, task, schedule=None):
        """添加单个任务的调度
        Args:
            task: 任务配置
            schedule: 可选的定时规则，用于默认定时
        """
        try:
            # 使用传入的 schedule 或任务自带的 cron
            cron_schedule = schedule or task.get('cron')
            if cron_schedule:
                task_id = task.get('order', 0) - 1  # 转换为前端使用的task_id
                self.scheduler.add_job(
                    self._execute_single_task,
                    CronTrigger.from_crontab(cron_schedule),
                    args=[task],
                    id=f'task_{task_id}',  # 使用task_id作为任务标识
                    replace_existing=True
                )
                # 根据schedule参数判断是默认定时还是自定义定时
                schedule_type = "默认定时" if schedule else "自定义定时"
                logger.info(f"已添加{schedule_type}任务: {task.get('name', task['url'])}, 调度: {cron_schedule}")
        except Exception as e:
            logger.error(f"添加任务调度失败 ({task.get('name', task['url'])}): {str(e)}")

    def start(self):
        """启动调度器"""
        try:
            if not self.scheduler:
                self._init_scheduler()
            
            # 直接启动调度器，因为任务已经在_init_scheduler中添加
            self.scheduler.start()
            self.is_running = True  # 设置运行状态
            logger.success("调度器已启动")
            
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
                'max_instances': 1,  # 同一个任务同时只能有一个实例
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
                        
                    self.scheduler.add_job(
                        self._execute_single_task,
                        CronTrigger.from_crontab(task['cron']),
                        args=[task],
                        id=f'task_order_{task_order}',  # 使用order作为任务ID
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
                                CronTrigger.from_crontab(cron_exp),
                                args=[task],
                                id=f'task_order_{task_order}_{i}',  # 使用order作为任务ID的一部分
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
                json.dump(self.config, f, ensure_ascii=False, indent=4)
        except Exception as e:
            logger.error(f"保存配置文件失败: {str(e)}")

    def _execute_task_group(self, tasks=None):
        """执行任务组 - 这是执行默认定时任务的方法
        Args:
            tasks: 要执行的任务列表，如果为None则执行所有默认任务
        """
        try:
            logger.info(f"=== 开始执行定时任务组 === 时间: {time.strftime('%Y-%m-%d %H:%M:%S')} ===")
            
            results = {
                'success': [],
                'failed': [],
                'skipped': [],
                'transferred_files': {}
            }
            
            # 如果没有指定任务列表，获取所有没有自定义cron的任务
            if tasks is None:
                tasks = [t for t in self._get_current_tasks() if not t.get('cron')]
            
            for task in tasks:
                try:
                    task_name = task.get('name', task['url'])
                    logger.info(f"--- 开始处理任务: {task_name} ---")
                    
                    # 用于收集转存的文件
                    transferred_files = []
                    
                    def progress_callback(status, msg):
                        logger.info(f"转存进度 - {status}: {msg}")
                        # 从进度消息中提取转存文件信息
                        if status == 'info' and msg.startswith('添加文件:'):
                            # 提取完整的文件路径
                            file_path = msg.replace('添加文件:', '').strip()
                            # 保持文件的完整路径结构
                            transferred_files.append(file_path)
                    
                    # 执行转存
                    result = self.storage.transfer_share(
                        task['url'],
                        task.get('pwd'),
                        None,
                        task.get('save_dir'),
                        progress_callback
                    )

                    if result.get('success'):
                        if result.get('skipped'):
                            logger.info(f"任务 {task_name} 无需更新（所有文件已存在）")
                            results['skipped'].append(task)
                        else:
                            logger.success(f"任务 {task_name} 执行成功")
                            results['success'].append(task)
                            if transferred_files:
                                # 按目录分组显示文件
                                files_by_dir = {}
                                for file_path in transferred_files:
                                    dir_path = os.path.dirname(file_path)
                                    if not dir_path:
                                        dir_path = '/'
                                    files_by_dir.setdefault(dir_path, []).append(os.path.basename(file_path))
                                
                                # 显示分组后的文件
                                for dir_path, files in files_by_dir.items():
                                    logger.info(f"转存到 {dir_path}:")
                                    for file in sorted(files):
                                        logger.info(f"  - {file}")
                                
                                results['transferred_files'][task['url']] = transferred_files
                    else:
                        error_msg = result.get('error', '未知错误')
                        logger.error(f"任务 {task_name} 转存失败：{error_msg}")
                        results['failed'].append(task)

                except Exception as e:
                    logger.error(f"执行任务 {task_name} 时发生错误: {str(e)}")
                    task['error'] = str(e)
                    results['failed'].append(task)
            
            # 发送通知
            if results['success'] or results['failed']:
                try:
                    notification_content = generate_transfer_notification(results)
                    logger.info(f"准备发送通知:\n{notification_content}")
                    notify_send("百度网盘自动追更", notification_content)
                    logger.info("通知发送成功")
                except Exception as e:
                    logger.error(f"发送通知失败: {str(e)}")
            
            logger.info(f"=== 任务组执行完成 === 时间: {time.strftime('%Y-%m-%d %H:%M:%S')} ===")
            logger.info(f"成功: {len(results['success'])} 个, 跳过: {len(results['skipped'])} 个, 失败: {len(results['failed'])} 个")
                
        except Exception as e:
            logger.error(f"执行任务组失败: {str(e)}")

    def stop(self):
        """停止调度器"""
        try:
            if self.scheduler and self.is_running:
                self.scheduler.shutdown()
                self.is_running = False
                logger.info("调度器已停止")
            else:
                logger.info("调度器未在运行")
        except Exception as e:
            logger.error(f"停止调度器失败: {str(e)}")
        finally:
            self.scheduler = None

    def update_task(self, task_url, cron_exp):
        """更新任务的调度时间
        Args:
            task_url: 任务URL
            cron_exp: 新的cron表达式
        """
        try:
            # 更新配置文件
            tasks = self.config.get('baidu', {}).get('tasks', [])
            for task in tasks:
                if task.get('url') == task_url:
                    task['cron'] = cron_exp
                    break
            self._save_config()
            
            # 更新调度器中的任务
            job_id = f"task_{task_url}"
            if self.scheduler.get_job(job_id):
                self.scheduler.reschedule_job(
                    job_id,
                    trigger=CronTrigger.from_crontab(cron_exp)
                )
                logger.success(f"已更新任务调度: {task_url} -> {cron_exp}")
            
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
            
            self.default_schedule = schedules
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
            job_id = f"task_{task_url}"
            if self.scheduler.get_job(job_id):
                self.scheduler.remove_job(job_id)
                logger.success(f"已移除任务: {task_url}")
        except Exception as e:
            logger.error(f"移除任务失败: {str(e)}")

    def _init_notify(self):
        """初始化通知配置"""
        try:
            notify_config = self.storage.config.get('notify', {})
            if notify_config and notify_config.get('enabled'):
                # 更新推送配置
                from notify import push_config
                for channel, config in notify_config.get('channels', {}).items():
                    if channel == 'pushplus':
                        push_config['PUSH_PLUS_TOKEN'] = config.get('token')
                        push_config['PUSH_PLUS_USER'] = config.get('topic')
                logger.info("通知配置已加载")
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
        """更新任务状态
        Args:
            task_url: 任务URL
            status: 状态 (success/failed/skipped)
            error_msg: 错误信息
        """
        try:
            tasks = self.config.get('baidu', {}).get('tasks', [])
            for task in tasks:
                if task['url'] == task_url:
                    task['status'] = status
                    if error_msg:
                        task['error'] = error_msg
                    elif 'error' in task:
                        del task['error']
                    break
            self._save_config()
        except Exception as e:
            logger.error(f"更新任务状态失败: {str(e)}")

    def _execute_single_task(self, task):
        """执行单个任务
        Args:
            task: 任务配置
        """
        try:
            # 获取最新的任务信息
            tasks = self.storage.config['baidu']['tasks']
            task_order = task.get('order')
            if not task_order:
                logger.error(f"任务缺少order: {task.get('name', task.get('url', '未知任务'))}")
                return False
                
            current_task = next((t for t in tasks if t.get('order') == task_order), None)
            
            if not current_task:
                logger.error(f"未找到任务: order={task_order}")
                return False
            
            task_id = task_order - 1  # 转换为前端使用的task_id
            task_name = current_task.get('name', f'任务{task_order}')
            logger.info(f"开始执行任务: {task_name}")
            logger.info(f"分享链接: {current_task.get('url', '')}")
            logger.info(f"保存目录: {current_task.get('save_dir', '')}")
            logger.info(f"提取码: {current_task.get('pwd', '')}")
            logger.info("")
            
            # 确保存储实例可用
            if not self.storage.is_valid():
                logger.warning("存储实例状态异常，尝试刷新登录状态")
                if not self.storage.refresh_login():
                    logger.error("刷新登录状态失败")
                    return False

            # 更新结果字典的结构
            results = {
                'success': [],
                'failed': [],
                'skipped': [],
                'transferred_files': {}
            }

            # 使用最新的任务信息执行
            def progress_callback(status, message):
                logger.info(f"[{task_name}] {status}: {message}")
                if status == 'info' and message.startswith('添加文件:'):
                    file_path = message.replace('添加文件:', '').strip()
                    if task_id not in results['transferred_files']:
                        results['transferred_files'][task['url']] = []  # 使用 url 作为 key
                    results['transferred_files'][task['url']].append(file_path)

            # 验证必要的任务信息
            if not current_task.get('url') or not current_task.get('save_dir'):
                error_msg = "任务缺少必要信息(url或save_dir)"
                logger.error(error_msg)
                self.storage.update_task_status_by_order(task_order, 'failed', error_msg)
                return False

            result = self.storage.transfer_share(
                current_task['url'],
                current_task.get('pwd', ''),  # 使用空字符串作为默认值
                None,
                current_task['save_dir'],
                progress_callback
            )
            
            # 更新任务状态和结果
            try:
                if result.get('success'):
                    if result.get('skipped'):
                        self.storage.update_task_status_by_order(
                            task_order,
                            'skipped',
                            '没有新文件需要转存'
                        )
                    else:
                        self.storage.update_task_status_by_order(
                            task_order,
                            'success',
                            '转存成功',
                            transferred_files=result.get('transferred_files', [])
                        )
                        # 添加到成功列表
                        results['success'].append(current_task)
                        # 更新转存文件列表
                        if result.get('transferred_files'):
                            results['transferred_files'][current_task['url']] = result['transferred_files']
                else:
                    self.storage.update_task_status_by_order(
                        task_order,
                        'failed',
                        result.get('error', '转存失败')
                    )
                    current_task['error'] = result.get('error')
                    results['failed'].append(current_task)
                
                # 发送通知
                if results['success'] or results['failed']:
                    notification_content = generate_transfer_notification(results)
                    if notification_content.strip():  # 只在有内容时发送通知
                        logger.info(f"准备发送通知:\n{notification_content}")
                        notify_send("百度网盘自动追更", notification_content)
                        logger.info("通知发送成功")
                    else:
                        logger.warning("生成的通知内容为空，跳过发送")
                
                return result.get('success', False)
                
            except Exception as e:
                logger.error(f"更新任务状态失败: {str(e)}")
                return False
            
        except Exception as e:
            logger.error(f"执行任务失败: {str(e)}")
            try:
                self.storage.update_task_status_by_order(task_order, 'failed', str(e))
                # 添加失败通知
                results = {
                    'success': [],
                    'failed': [task],
                    'transferred_files': {}
                }
                notification_content = generate_transfer_notification(results)
                if notification_content.strip():
                    notify_send("百度网盘自动追更", notification_content)
            except:
                pass
            return False

    def update_task_schedule(self, task_url, cron_exp=None):
        """更新任务调度
        Args:
            task_url: 任务的URL（用作任务ID）
            cron_exp: 新的cron表达式，如果为None则保持原值
        """
        try:
            # 获取最新的任务信息
            tasks = self.storage.config['baidu']['tasks']
            current_task = next((task for task in tasks if task['url'] == task_url), None)
            
            if not current_task:
                logger.error(f"未找到任务: {task_url}")
                return False
                
            task_order = current_task.get('order')
            if not task_order:
                logger.error(f"任务缺少order: {task_url}")
                return False
            
            task_id = task_order - 1  # 转换为前端使用的task_id
            job_id = f'task_{task_id}'
            
            # 如果任务已存在，先移除
            if self.scheduler.get_job(job_id):
                self.scheduler.remove_job(job_id)
            
            # 使用新的cron表达式或保持原值
            final_cron = cron_exp if cron_exp is not None else current_task.get('cron')
            
            if final_cron:
                # 使用最新的任务信息重新添加任务
                self.scheduler.add_job(
                    self._execute_single_task,
                    CronTrigger.from_crontab(final_cron),
                    args=[current_task],
                    id=job_id,
                    replace_existing=True
                )
                logger.info(f"已更新任务调度: {task_url} (task_id={task_id}) -> {final_cron}")
            else:
                # 如果任务切换到使用默认定时，需要更新整个调度
                logger.info(f"任务 {task_url} (task_id={task_id}) 切换到默认定时，正在更新调度...")
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