from baidupcs_py.baidupcs import BaiduPCSApi
from baidupcs_py.baidupcs.errors import BaiduPCSError
from loguru import logger
import json
import os
import time
import re
from notify import send as notify_send
import posixpath
from threading import Lock
import traceback
import subprocess
import json

class BaiduStorage:
    def __init__(self):
        self._client_lock = Lock()  # 添加客户端初始化锁
        self.config = self._load_config()
        self.client = None
        self._init_client()
        self.last_request_time = 0
        self.min_request_interval = 2
        # 添加错误跟踪
        self.last_error = None
        self.task_locks = {}  # 用于存储每个任务的锁
        # 添加用户信息缓存
        self._user_info_cache = None
        self._user_info_cache_time = 0
        self._cache_ttl = 30  # 缓存有效期（秒）
        
    def _load_config(self):
        try:
            with open('config/config.json', 'r', encoding='utf-8') as f:
                config = json.load(f)
                # 确保配置文件结构完整
                if 'baidu' not in config:
                    config['baidu'] = {}
                if 'users' not in config['baidu']:
                    config['baidu']['users'] = {}
                if 'current_user' not in config['baidu']:
                    config['baidu']['current_user'] = None
                if 'tasks' not in config['baidu']:
                    config['baidu']['tasks'] = []
                if 'cron' not in config:
                    config['cron'] = {
                        'default_schedule': '*/5 * * * *',
                        'auto_install': True
                    }
                # 添加 auth 配置结构
                if 'auth' not in config:
                    config['auth'] = {
                        'users': 'admin',
                        'password': 'admin123',
                        'session_timeout': 3600
                    }
                return config
        except FileNotFoundError:
            return {
                'baidu': {
                    'users': {},
                    'current_user': None,
                    'tasks': []
                },
                'cron': {
                    'default_schedule': '*/5 * * * *',
                    'auto_install': True
                },
                'auth': {
                    'users': 'admin',
                    'password': 'admin123',
                    'session_timeout': 3600
                }
            }
        except Exception as e:
            logger.error(f"加载配置文件失败: {str(e)}")
            raise
            
    def _save_config(self, update_scheduler=True):
        """保存配置到文件"""
        try:
            # 在保存前清理 None 值的 cron 字段
            for task in self.config.get('baidu', {}).get('tasks', []):
                if 'cron' in task and task['cron'] is None:
                    del task['cron']
                    
            with open('config/config.json', 'w', encoding='utf-8') as f:
                json.dump(self.config, f, ensure_ascii=False, indent=4)
            
            logger.debug("配置保存成功")
            
            # 确保配置已经写入文件
            with open('config/config.json', 'r', encoding='utf-8') as f:
                saved_config = json.load(f)
                if saved_config != self.config:
                    logger.error("配置保存验证失败")
                    raise Exception("配置保存验证失败")
            
            # 通知调度器更新任务
            if update_scheduler:
                from scheduler import TaskScheduler
                if hasattr(TaskScheduler, 'instance') and TaskScheduler.instance:
                    TaskScheduler.instance.update_tasks()
            
        except Exception as e:
            logger.error(f"保存配置失败: {str(e)}")
            raise
            
    def _init_client(self):
        """初始化客户端"""
        with self._client_lock:  # 使用锁保护初始化过程
            try:
                current_user = self.config['baidu'].get('current_user')
                if not current_user:
                    logger.error("未设置当前用户")
                    return False
                    
                user_info = self.config['baidu']['users'].get(current_user)
                if not user_info or not user_info.get('cookies'):
                    logger.error(f"用户 {current_user} 配置无效")
                    return False
                    
                cookies = self._parse_cookies(user_info['cookies'])
                if not self._validate_cookies(cookies):
                    logger.error("cookies 无效")
                    return False
                    
                # 清除用户信息缓存
                self._clear_user_info_cache()
                
                # 使用重试机制初始化客户端
                for retry in range(3):
                    try:
                        self.client = BaiduPCSApi(cookies=cookies)
                        # 验证客户端
                        quota = self.client.quota()
                        total_gb = round(quota[0] / (1024**3), 2)
                        used_gb = round(quota[1] / (1024**3), 2)
                        logger.info(f"客户端初始化成功，网盘总空间: {total_gb}GB, 已使用: {used_gb}GB")
                        return True
                    except Exception as e:
                        if retry < 2:
                            logger.warning(f"客户端初始化失败，等待重试: {str(e)}")
                            time.sleep(3)
                        else:
                            logger.error(f"客户端初始化失败: {str(e)}")
                            return False
                            
            except Exception as e:
                logger.error(f"初始化客户端失败: {str(e)}")
                return False
            
    def _validate_cookies(self, cookies):
        """验证cookies是否有效
        Args:
            cookies: cookies字典
        Returns:
            bool: 是否有效
        """
        try:
            required_cookies = ['BDUSS', 'STOKEN']
            missing = [c for c in required_cookies if c not in cookies]
            if missing:
                logger.error(f'缺少必要的 cookies: {missing}')
                return False
            return True
        except Exception as e:
            logger.error(f"验证cookies失败: {str(e)}")
            return False
            
    def _parse_cookies(self, cookies_str):
        """解析 cookies 字符串为字典
        Args:
            cookies_str: cookies 字符串，格式如 'key1=value1; key2=value2'
        Returns:
            dict: cookies 字典
        """
        cookies = {}
        if not cookies_str:
            return cookies
            
        items = cookies_str.split(';')
        for item in items:
            if not item.strip():
                continue
            if '=' not in item:
                continue
            key, value = item.split('=', 1)
            cookies[key.strip()] = value.strip()
        return cookies
        
    def add_user_from_cookies(self, cookies_str, username=None):
        """直接从 cookies 字符串添加用户
        Args:
            cookies_str: cookies 字符串
            username: 指定用户名,可选
        """
        try:
            # 解析 cookies 字符串为字典
            cookies_dict = self._parse_cookies(cookies_str)
            if not cookies_dict:
                raise ValueError("无效的 cookies 格式")
                
            # 验证 cookies 是否有效
            temp_api = BaiduPCSApi(cookies=cookies_dict)
            user_info = temp_api.user_info()
            
            if not user_info:
                raise ValueError("Cookies 无效")
                
            # 使用指定用户名或生成唯一用户名
            if not username:
                username = "user"
            if username in self.config['baidu']['users']:
                i = 1
                while f"{username}_{i}" in self.config['baidu']['users']:
                    i += 1
                username = f"{username}_{i}"
                
            # 保存用户信息
            self.config['baidu']['users'][username] = {
                "cookies": cookies_str,
                "name": username,
                "user_id": username
            }
            
            # 如果是第一个用户,设为当前用户
            if not self.config['baidu']['current_user']:
                self.config['baidu']['current_user'] = username
                
            self._save_config()
            
            # 如果添加的是当前用户,重新初始化客户端
            if username == self.config['baidu']['current_user']:
                self._init_client()
                
            logger.success(f"成功添加用户: {username}")
            return True
            
        except Exception as e:
            logger.error(f"添加用户失败: {str(e)}")
            return False
    
    def add_user(self, cookies=None, bduss=None, stoken=None, username=None):
        """添加百度网盘用户
        Args:
            cookies: 完整的 cookies 字符串
            bduss: BDUSS 值
            stoken: STOKEN 值,用于分享功能
            username: 用户名,不指定则使用百度返回的用户名
        """
        try:
            if not (cookies or bduss):
                raise ValueError("cookies 和 bduss 至少需要提供一个")
                
            if cookies:
                return self.add_user_from_cookies(cookies, username)
                
            # 构造 cookies 字符串
            cookies = f"BDUSS={bduss}"
            if stoken:
                cookies += f"; STOKEN={stoken}"
                
            return self.add_user_from_cookies(cookies, username)
            
        except Exception as e:
            logger.error(f"添加用户失败: {str(e)}")
            return False
            
    def _clear_user_info_cache(self):
        """清除用户信息缓存"""
        self._user_info_cache = None
        self._user_info_cache_time = 0
        logger.debug("已清除用户信息缓存")
        
    def switch_user(self, username):
        """切换当前用户"""
        try:
            if username not in self.config['baidu']['users']:
                raise ValueError(f"用户 {username} 不存在")
                
            self.config['baidu']['current_user'] = username
            self._save_config()
            self._init_client()
            # 清除用户信息缓存
            self._clear_user_info_cache()
            
            logger.success(f"已切换到用户: {username}")
            return True
            
        except Exception as e:
            logger.error(f"切换用户失败: {str(e)}")
            return False
            
    def remove_user(self, username):
        """删除用户"""
        try:
            if username not in self.config['baidu']['users']:
                raise ValueError(f"用户 {username} 不存在")
                
            # 不能删除当前用户
            if username == self.config['baidu']['current_user']:
                raise ValueError("不能删除当前使用的用户")
                
            del self.config['baidu']['users'][username]
            self._save_config()
            
            logger.success(f"已删除用户: {username}")
            return True
            
        except Exception as e:
            logger.error(f"删除用户失败: {str(e)}")
            return False
            
    def list_users(self):
        """获取用户列表"""
        users = []
        current_user = self.config['baidu'].get('current_user')
        
        for username, user_info in self.config['baidu'].get('users', {}).items():
            users.append({
                'username': username,
                'name': user_info.get('name', username),
                'user_id': user_info.get('user_id', username)
            })
        
        return users
            
    def get_user_info(self):
        """获取当前用户信息"""
        try:
            if not self.client:
                return None
            
            # 检查缓存是否有效
            current_time = time.time()
            if (self._user_info_cache is not None and 
                current_time - self._user_info_cache_time < self._cache_ttl):
                logger.debug("使用缓存的用户信息，跳过API调用")
                return self._user_info_cache
            
            # 首先尝试获取配额信息
            try:
                quota_info = self.client.quota()
                if isinstance(quota_info, (tuple, list)):
                    quota = {
                        'total': quota_info[0],
                        'used': quota_info[1]
                    }
                else:
                    quota = quota_info
                logger.debug("成功获取网盘配额信息")
                
                # 分步获取用户信息
                try:
                    # 1. 先获取网盘用户信息
                    logger.debug("开始获取网盘用户信息...")
                    pan_info = self.client._baidupcs.user_info()
                    logger.debug(f"网盘用户信息: {pan_info}")
                    
                    user_id = int(pan_info["user"]["id"])
                    user_name = pan_info["user"]["name"]
                    
                    # 构建并缓存用户信息
                    user_info = {
                        'user_name': user_name,
                        'user_id': user_id,
                        'quota': quota
                    }
                    
                    # 更新缓存
                    self._user_info_cache = user_info
                    self._user_info_cache_time = current_time
                    
                    return user_info
                    
                except Exception as e:
                    logger.warning(f"获取用户详细信息失败: {str(e)}")
                    
                    # 即使获取详细信息失败，也缓存基本配额信息
                    user_info = {
                        'user_name': '未知用户',
                        'user_id': None,
                        'quota': quota
                    }
                    self._user_info_cache = user_info
                    self._user_info_cache_time = current_time
                    
                    return user_info
                    
            except Exception as e:
                logger.error(f"获取网盘信息失败: {str(e)}")
                return None
                
        except Exception as e:
            logger.error(f"获取用户信息失败: {str(e)}")
            return None
            
    def _save_record(self, share_url, status):
        """保存转存记录
        Args:
            share_url: 分享链接
            status: 转存状态,True表示成功,False表示失败
        """
        try:
            record = {
                "url": share_url,
                "time": time.strftime("%Y-%m-%d %H:%M:%S"),
                "status": "成功" if status else "失败"
            }
            
            records = []
            try:
                with open('file_records.json', 'r', encoding='utf-8') as f:
                    content = f.read().strip()
                    if content:  # 只有当文件不为空时才解析
                        records = json.loads(content)
                    if not isinstance(records, list):
                        records = []
            except FileNotFoundError:
                # 文件不存在时创建空列表
                records = []
                
            records.append(record)
            
            with open('file_records.json', 'w', encoding='utf-8') as f:
                json.dump(records, f, ensure_ascii=False, indent=4)
                
        except Exception as e:
            logger.error(f"保存转存记录失败: {str(e)}")
            
    def get_max_order(self):
        """获取当前最大的任务顺序值"""
        try:
            tasks = self.config['baidu'].get('tasks', [])
            if not tasks:
                return 0
            return max((task.get('order', 0) for task in tasks), default=0)
        except Exception as e:
            logger.error(f"获取最大顺序值失败: {str(e)}")
            return 0

    def _update_task_orders(self):
        """重新整理所有任务的顺序"""
        try:
            tasks = self.config['baidu'].get('tasks', [])
            # 按现有order排序，没有order的排在最后
            tasks.sort(key=lambda x: x.get('order', float('inf')))
            # 重新分配order，从1开始
            for i, task in enumerate(tasks, 1):
                task['order'] = i
            self.config['baidu']['tasks'] = tasks
            self._save_config()
            return True
        except Exception as e:
            logger.error(f"更新任务顺序失败: {str(e)}")
            return False

    def reorder_task(self, task_order, new_order):
        """调整任务顺序
        Args:
            task_order: 任务的当前order
            new_order: 新的顺序值
        Returns:
            bool: 是否成功
        """
        try:
            tasks = self.config['baidu'].get('tasks', [])
            
            # 查找要移动的任务
            task = next((t for t in tasks if t.get('order') == task_order), None)
            if not task:
                logger.error(f"未找到任务: order={task_order}")
                return False
            
            # 如果新顺序无效，返回失败
            max_order = len(tasks)
            if not (1 <= new_order <= max_order):
                logger.error(f"无效的新顺序: {new_order}, 最大值: {max_order}")
                return False
            
            # 调整其他任务的顺序
            if new_order < task_order:
                # 向前移动：中间的任务顺序+1
                for t in tasks:
                    if new_order <= t.get('order', 0) < task_order:
                        t['order'] = t.get('order', 0) + 1
            else:
                # 向后移动：中间的任务顺序-1
                for t in tasks:
                    if task_order < t.get('order', 0) <= new_order:
                        t['order'] = t.get('order', 0) - 1
            
            # 设置新顺序
            task['order'] = new_order
            
            # 重新排序任务列表
            tasks.sort(key=lambda x: x.get('order', float('inf')))
            self.config['baidu']['tasks'] = tasks
            self._save_config()
            
            logger.success(f"任务重排序成功: {task_order} -> {new_order}")
            return True
            
        except Exception as e:
            logger.error(f"调整任务顺序失败: {str(e)}")
            return False

    def add_task(self, url, save_dir, pwd=None, name=None, cron=None, category=None, regex_pattern=None, regex_replace=None, regex_description=None):
        """添加任务"""
        try:
            if not url or not save_dir:
                raise ValueError("分享链接和保存目录不能为空")
            
            # 移除URL中的hash部分
            url = url.split('#')[0]
            
            # 验证URL格式（更新正则表达式以适应可能的查询参数）
            if not re.match(r'^https?://pan\.baidu\.com/s/[a-zA-Z0-9_-]+(?:\?pwd=[a-zA-Z0-9]+)?$', url):
                raise ValueError("无效的百度网盘分享链接格式")
            
            # 获取新任务的顺序值
            new_order = self.get_max_order() + 1
            
            # 创建新任务
            new_task = {
                'url': url,
                'save_dir': save_dir,
                'pwd': pwd,
                'name': name or url,
                'status': 'pending',
                'transferred_files': [],
                'order': new_order
            }
            
            # 添加可选字段
            if cron:
                new_task['cron'] = cron
            if category:
                new_task['category'] = category.strip()
            if regex_pattern:
                new_task['regex_pattern'] = regex_pattern.strip()
                new_task['regex_replace'] = regex_replace.strip() if regex_replace else ''
                new_task['regex_description'] = regex_description.strip() if regex_description else ''
            
            # 添加任务
            tasks = self.config['baidu'].get('tasks', [])
            tasks.append(new_task)
            self.config['baidu']['tasks'] = tasks
            
            # 保存配置
            self._save_config()
            
            # 通知调度器更新任务
            from scheduler import TaskScheduler
            if hasattr(TaskScheduler, 'instance') and TaskScheduler.instance:
                TaskScheduler.instance.add_single_task(new_task)
            
            logger.success(f"添加任务成功: {new_task}")
            return True
            
        except Exception as e:
            logger.error(f"添加任务失败: {str(e)}")
            return False
            
    def remove_task(self, share_url):
        """删除转存任务
        Args:
            share_url: 分享链接
        Returns:
            bool: 是否删除成功
        """
        try:
            tasks = self.config['baidu']['tasks']
            for i, task in enumerate(tasks):
                if task['url'] == share_url:
                    tasks.pop(i)
                    # 确保更新调度器
                    self._save_config(update_scheduler=True)
                    logger.success(f"删除任务成功: {share_url}")
                    return True
            logger.warning(f"未找到任务: {share_url}")
            return False
        except Exception as e:
            logger.error(f"删除任务失败: {str(e)}")
            return False
            
    def list_tasks(self):
        """列出所有转存任务"""
        return self.config['baidu']['tasks']
            
    def _normalize_path(self, path, file_only=False):
        """标准化路径
        Args:
            path: 原始路径
            file_only: 是否只返回文件名
        Returns:
            str: 标准化后的路径
        """
        try:
            # 统一使用正斜杠，去除多余斜杠
            path = path.replace('\\', '/').strip('/')
            
            if file_only:
                # 只返回文件名
                return path.split('/')[-1]
            
            # 确保目录以 / 开头
            if not path.startswith('/'):
                path = '/' + path
            return path
        except Exception as e:
            logger.error(f"标准化路径失败: {str(e)}")
            return path

    def _ensure_dir_exists(self, path):
        """确保目录存在，如果不存在则创建
        Args:
            path: 目录路径
        Returns:
            bool: 是否成功
        """
        try:
            path = self._normalize_path(path)
            
            # 检查目录是否存在
            try:
                self.client.list(path)
                logger.debug(f"目录已存在: {path}")
                return True
            except Exception as e:
                if 'error_code: 31066' in str(e):  # 目录不存在
                    logger.info(f"目录不存在，开始创建: {path}")
                    try:
                        self.client.makedir(path)
                        logger.success(f"创建目录成功: {path}")
                        return True
                    except Exception as create_e:
                        if 'error_code: 31062' in str(create_e):  # 文件名非法
                            logger.error(f"目录名非法: {path}")
                        elif 'file already exists' in str(create_e).lower():
                            # 并发创建时可能发生
                            logger.debug(f"目录已存在（可能是并发创建）: {path}")
                            return True
                        elif 'no such file or directory' in str(create_e).lower():
                            # 需要创建父目录
                            parent_dir = os.path.dirname(path)
                            if parent_dir and parent_dir != '/':
                                logger.info(f"需要先创建父目录: {parent_dir}")
                                if self._ensure_dir_exists(parent_dir):
                                    # 父目录创建成功，重试创建当前目录
                                    return self._ensure_dir_exists(path)
                                else:
                                    logger.error(f"创建父目录失败: {parent_dir}")
                                    return False
                            logger.error(f"无法创建目录，父目录不存在: {path}")
                            return False
                        else:
                            logger.error(f"创建目录失败: {path}, 错误: {str(create_e)}")
                            return False
                else:
                    logger.error(f"检查目录失败: {path}, 错误: {str(e)}")
                    return False
                    
        except Exception as e:
            logger.error(f"确保目录存在时发生错误: {path}, 错误: {str(e)}")
            return False

    def _ensure_dir_tree_exists(self, path):
        """确保目录树存在，会检查并创建所有必要的父目录
        Args:
            path: 目录路径
        Returns:
            bool: 是否成功
        """
        try:
            path = self._normalize_path(path)
            
            # 如果目录已存在，直接返回成功
            try:
                self.client.list(path)
                logger.debug(f"目录已存在: {path}")
                return True
            except:
                pass
                
            # 分解路径
            parts = path.strip('/').split('/')
            current_path = ''
            
            # 逐级检查和创建目录
            for part in parts:
                if not part:
                    continue
                current_path = self._normalize_path(current_path + '/' + part)
                if not self._ensure_dir_exists(current_path):
                    return False
                    
            return True
            
        except Exception as e:
            logger.error(f"创建目录树失败: {str(e)}")
            return False

    def _handle_api_error(self, error):
        """处理API错误"""
        error_str = str(error)
        
        # 常见错误码处理
        error_map = {
            '-6': '身份验证失败，请重新登录',
            '-9': '文件不存在',
            '-62': '参数错误',
            '-65': '访问频率限制',
            '-130': '请求错误',
        }
        
        for code, msg in error_map.items():
            if f'error_code: {code}' in error_str:
                return code, msg
                
        return None, error_str

    def _handle_folder_structure(self, shared_paths, save_dir):
        """处理文件夹结构
        Args:
            shared_paths: 分享的路径列表
            save_dir: 保存目录
        Returns:
            tuple: (目标目录, 是否为单文件夹)
        """
        try:
            if not shared_paths:
                return save_dir, False
                
            # 检查是否只有一个文件夹
            if len(shared_paths) == 1 and shared_paths[0].is_dir:
                # 单文件夹情况：直接使用保存目录
                logger.info("检测到单个文件夹分享，内容将直接保存到目标目录")
                return save_dir, True
                
            # 多文件/文件夹情况：保持原有结构
            logger.info("检测到多个文件/文件夹，将保持原有目录结构")
            return save_dir, False
            
        except Exception as e:
            logger.error(f"处理文件夹结构时出错: {str(e)}")
            return save_dir, False

    def _apply_regex_rules(self, file_path, task_config):
        """应用正则处理规则 (单个pattern+replace)
        Args:
            file_path: 原始文件路径
            task_config: 任务配置（包含正则规则）
        Returns:
            tuple: (should_transfer, final_path)
                should_transfer: 是否应该转存（False表示被过滤掉）
                final_path: 处理后的文件路径
        """
        try:
            # 获取正则规则
            pattern = task_config.get('regex_pattern', '')
            replace = task_config.get('regex_replace', '')
            
            if not pattern:
                # 没有规则，直接返回原文件
                return True, file_path
            
            try:
                # 1. 尝试匹配
                match = re.search(pattern, file_path)
                if not match:
                    # 匹配失败 = 文件被过滤掉
                    logger.debug(f"文件被正则规则过滤: {file_path} (规则: {pattern})")
                    return False, file_path
                
                # 2. 匹配成功，检查是否需要重命名
                if replace and replace.strip():
                    # 有替换内容，执行重命名
                    new_path = re.sub(pattern, replace, file_path)
                    if new_path != file_path:
                        logger.debug(f"正则重命名: {file_path} -> {new_path}")
                        return True, new_path
                
                # 3. 匹配成功但无重命名，返回原路径
                return True, file_path
                
            except re.error as e:
                logger.warning(f"正则表达式错误: {pattern}, 错误: {str(e)}")
                # 正则错误时不过滤，返回原文件
                return True, file_path
            
        except Exception as e:
            logger.error(f"应用正则规则时出错: {str(e)}")
            # 出错时返回原始路径，不影响正常流程
            return True, file_path

    def transfer_share(self, share_url, pwd=None, new_files=None, save_dir=None, progress_callback=None, task_config=None):
        """转存分享文件
        Args:
            share_url: 分享链接
            pwd: 提取码
            new_files: 指定要转存的文件列表
            save_dir: 保存目录
            progress_callback: 进度回调函数
            task_config: 任务配置（包含正则规则等）
        Returns:
            dict: {
                'success': bool,  # 是否成功
                'message': str,   # 成功时的消息
                'error': str,     # 失败时的错误信息
                'skipped': bool,  # 是否跳过（没有新文件）
                'transferred_files': list  # 成功转存的文件列表
            }
        """
        try:
            # 规范化保存路径
            if save_dir and not save_dir.startswith('/'):
                save_dir = '/' + save_dir
            
            # 步骤1：访问分享链接并获取文件列表
            logger.info(f"正在访问分享链接: {share_url}")
            if progress_callback:
                progress_callback('info', f'【步骤1/4】访问分享链接: {share_url}')
            
            try:
                # 访问分享链接
                if pwd:
                    logger.info(f"使用密码 {pwd} 访问分享链接")
                if progress_callback:
                        progress_callback('info', f'使用密码访问分享链接')
                self.client.access_shared(share_url, pwd)
                
                # 步骤1.1：获取分享文件列表并记录
                logger.info("获取分享文件列表...")
                shared_paths = self.client.shared_paths(shared_url=share_url)
                if not shared_paths:
                    logger.error("获取分享文件列表失败")
                    if progress_callback:
                        progress_callback('error', '获取分享文件列表失败')
                    return {'success': False, 'error': '获取分享文件列表失败'}
                
                # 记录分享文件信息
                logger.info(f"成功获取分享文件列表，共 {len(shared_paths)} 项")
                
                # 获取分享信息
                uk = shared_paths[0].uk
                share_id = shared_paths[0].share_id
                bdstoken = shared_paths[0].bdstoken
                
                # 记录共享文件详情
                shared_files_info = []
                for path in shared_paths:
                    if path.is_dir:
                        logger.info(f"记录共享文件夹: {path.path}")
                        # 获取文件夹内容
                        folder_files = self._list_shared_dir_files(path, uk, share_id, bdstoken)
                        for file_info in folder_files:
                            shared_files_info.append(file_info)
                            logger.debug(f"记录共享文件: {file_info['path']}")
                    else:
                        logger.debug(f"记录共享文件: {path.path}")
                        shared_files_info.append({
                            'server_filename': os.path.basename(path.path),
                            'fs_id': path.fs_id,
                            'path': path.path,
                            'size': path.size,
                            'isdir': 0
                        })
                
                logger.info(f"共记录 {len(shared_files_info)} 个共享文件")
                if progress_callback:
                    progress_callback('info', f'获取到 {len(shared_files_info)} 个共享文件')
                
                # 步骤2：扫描本地目录中的文件
                logger.info(f"【步骤2/4】扫描本地目录: {save_dir}")
                if progress_callback:
                    progress_callback('info', f'【步骤2/4】扫描本地目录: {save_dir}')
                
                # 获取本地文件列表
                local_files = []
                if save_dir:
                    local_files = self.list_local_files(save_dir)
                    if progress_callback:
                        progress_callback('info', f'本地目录中有 {len(local_files)} 个文件')
                
                # 步骤3：准备转存（对比文件、准备目录）
                target_dir = save_dir
                is_single_folder = (
                    len(shared_paths) == 1 
                    and shared_paths[0].is_dir 
                    and not new_files  # 如果指定了具体文件，不要跳过顶层目录
                )
                
                logger.info(f"【步骤3/4】准备转存: 对比文件和准备目录")
                if progress_callback:
                    progress_callback('info', f'【步骤3/4】准备转存: 对比文件和准备目录')
                
                # 步骤3.1：对比文件，确定需要转存的文件
                logger.info("开始对比共享文件和本地文件...")
                transfer_list = []  # 存储(fs_id, target_path, clean_path)元组
                
                # 使用之前收集的共享文件信息进行对比
                for file_info in shared_files_info:
                    clean_path = file_info['path']
                    if is_single_folder and '/' in clean_path:
                        clean_path = '/'.join(clean_path.split('/')[1:])
                    
                    # 🔄 新逻辑：先应用正则规则
                    should_transfer = True
                    final_path = clean_path
                    
                    if task_config:
                        should_transfer, final_path = self._apply_regex_rules(clean_path, task_config)
                        if not should_transfer:
                            logger.debug(f"文件被正则过滤掉: {clean_path}")
                            if progress_callback:
                                progress_callback('info', f'文件被正则过滤掉: {clean_path}')
                            continue
                    
                    # 🔄 用处理后的路径检查去重
                    normalized_path = self._normalize_path(final_path, file_only=True)
                    if normalized_path in local_files:
                        logger.debug(f"文件已存在，跳过: {final_path}")
                        if progress_callback:
                            progress_callback('info', f'文件已存在，跳过: {final_path}')
                        continue
                    
                    # 检查是否在指定的文件列表中（使用原始路径检查）
                    if new_files is None or clean_path in new_files:
                        # 🔄 后续处理都用final_path
                        if target_dir is not None and final_path is not None:
                            target_path = posixpath.join(target_dir, final_path)
                            # 确保目录路径使用正斜杠
                            dir_path = posixpath.dirname(target_path).replace('\\', '/')
                            transfer_list.append((file_info['fs_id'], dir_path, final_path))
                            
                            # 日志显示重命名信息
                            if final_path != clean_path:
                                logger.info(f"需要转存文件: {clean_path} -> {final_path}")
                                if progress_callback:
                                    progress_callback('info', f'需要转存文件: {clean_path} -> {final_path}')
                            else:
                                logger.info(f"需要转存文件: {final_path}")
                                if progress_callback:
                                    progress_callback('info', f'需要转存文件: {final_path}')
                
                if not transfer_list:
                    if progress_callback:
                        progress_callback('info', '没有找到需要转存的文件')
                    return {'success': True, 'skipped': True, 'message': '没有新文件需要转存'}
                
                if progress_callback:
                    progress_callback('info', f'找到 {len(transfer_list)} 个新文件需要转存')
                
                # 步骤3.2：创建所有必要的目录
                logger.info("确保所有目标目录存在")
                created_dirs = set()
                for _, dir_path, _ in transfer_list:
                    if dir_path not in created_dirs:
                        logger.info(f"检查目录: {dir_path}")
                        if not self._ensure_dir_exists(dir_path):
                            logger.error(f"创建目录失败: {dir_path}")
                            if progress_callback:
                                progress_callback('error', f'创建目录失败: {dir_path}')
                            return {'success': False, 'error': f'创建目录失败: {dir_path}'}
                        created_dirs.add(dir_path)
                
                # 步骤4：执行文件转存
                logger.info(f"=== 【步骤4/4】开始执行转存操作 ===")
                logger.info(f"共需转存 {len(transfer_list)} 个文件")
                if progress_callback:
                    progress_callback('info', f'【步骤4/4】开始执行转存操作，共 {len(transfer_list)} 个文件')
                
                # 按目录分组进行转存
                success_count = 0
                grouped_transfers = {}
                for fs_id, dir_path, _ in transfer_list:
                    grouped_transfers.setdefault(dir_path, []).append(fs_id)
                
                total_files = len(transfer_list)
                current_file = 0
                
                # 对每个目录进行批量转存
                logger.info(f"按目录分组进行转存，共 {len(grouped_transfers)} 个目录组")
                for dir_path, fs_ids in grouped_transfers.items():
                    # 确保目录路径使用正斜杠
                    dir_path = dir_path.replace('\\', '/')
                    if progress_callback:
                        progress_callback('info', f'转存到目录 {dir_path} ({len(fs_ids)} 个文件)')
                    
                    try:
                        logger.info(f"开始执行转存操作: 正在将 {len(fs_ids)} 个文件转存到 {dir_path}")
                        # 确保客户端和参数都有效
                        if self.client and uk is not None and share_id is not None and bdstoken is not None:
                            self.client.transfer_shared_paths(
                                remotedir=dir_path,
                                fs_ids=fs_ids,
                                uk=int(uk),
                                share_id=int(share_id),
                                bdstoken=str(bdstoken),
                                shared_url=share_url
                            )
                        else:
                            error_msg = "转存失败: 客户端或参数无效"
                            logger.error(error_msg)
                            raise ValueError(error_msg)
                        success_count += len(fs_ids)
                        current_file += len(fs_ids)
                        logger.success(f"转存操作成功完成: {len(fs_ids)} 个文件已转存到 {dir_path}")
                        if progress_callback:
                            progress_callback('success', f'成功转存到 {dir_path}')
                    except Exception as e:
                        if "error_code: -65" in str(e):  # 频率限制
                            if progress_callback:
                                progress_callback('warning', '触发频率限制，等待10秒后重试...')
                            logger.warning(f"转存操作受到频率限制，等待10秒后重试: {dir_path}")
                            time.sleep(10)
                            try:
                                logger.info(f"重试转存操作: 正在将 {len(fs_ids)} 个文件转存到 {dir_path}")
                                # 确保客户端和参数都有效
                                if self.client and uk is not None and share_id is not None and bdstoken is not None:
                                    self.client.transfer_shared_paths(
                                        remotedir=dir_path,
                                        fs_ids=fs_ids,
                                        uk=int(uk),
                                        share_id=int(share_id),
                                        bdstoken=str(bdstoken),
                                        shared_url=share_url
                                    )
                                else:
                                    error_msg = "重试转存失败: 客户端或参数无效"
                                    logger.error(error_msg)
                                    raise ValueError(error_msg)
                                success_count += len(fs_ids)
                                logger.success(f"重试转存成功: {len(fs_ids)} 个文件已转存到 {dir_path}")
                                if progress_callback:
                                    progress_callback('success', f'重试成功: {dir_path}')
                            except Exception as retry_e:
                                logger.error(f"重试转存失败: {dir_path} - {str(retry_e)}")
                                if progress_callback:
                                    progress_callback('error', f'转存失败: {dir_path} - {str(retry_e)}')
                                return {'success': False, 'error': f'转存失败: {dir_path} - {str(retry_e)}'}
                        else:
                            logger.error(f"转存操作失败: {dir_path} - {str(e)}")
                            if progress_callback:
                                progress_callback('error', f'转存失败: {dir_path} - {str(e)}')
                            return {'success': False, 'error': f'转存失败: {dir_path} - {str(e)}'}
                    
                    time.sleep(1)  # 避免频率限制
                
                # 记录转存的文件列表
                transferred_files = [clean_path for _, _, clean_path in transfer_list]
                
                # 转存结果汇总
                logger.info(f"=== 转存操作完成，结果汇总 ===")
                logger.info(f"总文件数: {total_files}")
                logger.info(f"成功转存: {success_count}")
                
                # 根据转存结果返回不同状态
                if success_count == total_files:  # 全部成功
                    logger.success(f"转存全部成功，共 {success_count}/{total_files} 个文件")
                    if progress_callback:
                        progress_callback('success', f'转存完成，成功转存 {success_count}/{total_files} 个文件')
                    return {
                        'success': True,
                        'message': f'成功转存 {success_count}/{total_files} 个文件',
                        'transferred_files': transferred_files
                    }
                elif success_count > 0:  # 部分成功
                    logger.warning(f"转存部分成功，共 {success_count}/{total_files} 个文件")
                    if progress_callback:
                        progress_callback('warning', f'部分转存成功，成功转存 {success_count}/{total_files} 个文件')
                    return {
                        'success': True,
                        'message': f'部分转存成功，成功转存 {success_count}/{total_files} 个文件',
                        'transferred_files': transferred_files[:success_count]
                    }
                else:  # 全部失败
                    if progress_callback:
                        progress_callback('error', '转存失败，没有文件成功转存')
                    return {
                        'success': False,
                        'error': '转存失败，没有文件成功转存'
                    }
                
            except Exception as e:
                error_msg = str(e)
                if "error_code: 115" in error_msg:
                    return {'success': False, 'error': error_msg}
                else:
                    return {'success': False, 'error': f'转存失败: {error_msg}'}
            
        except Exception as e:
            logger.error(f"转存分享文件失败: {str(e)}")
            return {'success': False, 'error': f'转存分享文件失败: {str(e)}'}

    def _wait_for_rate_limit(self):
        """等待请求限制"""
        current_time = time.time()
        if current_time - self.last_request_time < self.min_request_time:
            wait_time = self.min_request_time - (current_time - self.last_request_time)
            time.sleep(wait_time)
        self.last_request_time = time.time()

    def list_shared_files(self, share_url, pwd=None):
        """获取分享链接中的文件列表"""
        try:
            logger.info(f"开始获取分享链接 {share_url} 的文件列表")
            if pwd:
                logger.info(f"使用密码 {pwd} 访问分享链接")
                
            logger.debug("开始访问分享链接...")
            self.client.access_shared(share_url, pwd)
            logger.debug("分享链接访问成功")
            
            logger.debug("开始获取文件列表...")
            # 获取根目录文件列表
            files = self.client.shared_paths(shared_url=share_url)
            
            # 用于存储所有文件
            all_files = []
            
            def get_folder_contents():
                """递归获取文件夹内容"""
                for file in files:
                    if hasattr(file, 'is_dir') and file.is_dir:
                        logger.debug(f"进入文件夹: {file.path}")
                        try:
                            # 递归获取子目录内容
                            sub_files = self.client.list_shared_paths(
                                file.path,
                                file.uk,
                                file.share_id,
                                file.bdstoken,
                                page=1,
                                size=100
                            )
                            all_files.extend(sub_files)
                        except Exception as e:
                            logger.error(f"获取文件夹 {file.path} 内容失败: {str(e)}")
                    else:
                        all_files.append(file)
                        
            # 执行递归获取
            get_folder_contents()
            logger.info(f"共找到 {len(all_files)} 个文件")
            return all_files

        except Exception as e:
            logger.error(f"获取分享文件列表失败: {str(e)}")
            logger.error(f"异常类型: {type(e)}")
            logger.error("异常详情:", exc_info=True)
            raise

    def update_task_status(self, task_url, status, message=None, error=None, transferred_files=None):
        """更新任务状态
        Args:
            task_url: 任务URL
            status: 任务状态 (normal/error)
            message: 状态消息
            error: 错误信息（如果有）
            transferred_files: 成功转存的文件列表
        """
        try:
            tasks = self.config['baidu']['tasks']
            for task in tasks:
                if task['url'] == task_url:
                    # 状态转换逻辑
                    if message and ('成功' in message or '没有新文件需要转存' in message):
                        task['status'] = 'normal'
                    elif status in ['success', 'skipped', 'pending', 'running']:
                        task['status'] = 'normal'
                    else:
                        task['status'] = 'error'
                        
                    if message:
                        task['message'] = message
                    if error:
                        task['error'] = error
                        task['status'] = 'error'  # 如果有错误信息，强制设置为错误状态
                    elif status == 'error' and message:
                        task['error'] = message
                    if transferred_files:
                        task['transferred_files'] = transferred_files
                    
                    # 添加最后执行时间
                    task['last_execute_time'] = int(time.time())
                    
                    self._save_config()
                    logger.info(f"已更新任务状态: {task_url} -> {task['status']} ({message})")
                    return True
            return False
        except Exception as e:
            logger.error(f"更新任务状态失败: {str(e)}")
            return False

    def is_valid(self):
        """检查存储是否可用"""
        try:
            # 检查配置是否存在
            if not self.config or 'baidu' not in self.config:
                return False
                
            # 检查是否有当前用户
            current_user = self.config['baidu'].get('current_user')
            if not current_user:
                return False
                
            # 检查用户信息
            try:
                user_info = self.get_user_info()
                return bool(user_info)
            except:
                return False
                
        except Exception as e:
            logger.error(f"检查存储状态失败: {str(e)}")
            return False
            
    def list_local_files(self, dir_path):
        """获取本地目录中的所有文件列表"""
        try:
            logger.debug(f"开始获取本地目录 {dir_path} 的文件列表")
            files = []
            
            # 检查目录是否存在
            try:
                # 尝试列出目录内容来检查是否存在
                self.client.list(dir_path)
            except Exception as e:
                if "No such file or directory" in str(e) or "-9" in str(e):
                    logger.info(f"本地目录 {dir_path} 不存在，将在转存时创建")
                    return []
                else:
                    logger.error(f"检查目录 {dir_path} 时出错: {str(e)}")
            
            def _list_dir(path):
                try:
                    content = self.client.list(path)
                    
                    for item in content:
                        if item.is_file:
                            # 只保留文件名进行对比
                            file_name = os.path.basename(item.path)
                            files.append(file_name)
                            logger.debug(f"记录本地文件: {file_name}")
                        elif item.is_dir:
                            _list_dir(item.path)
                            
                except Exception as e:
                    logger.error(f"列出目录 {path} 失败: {str(e)}")
                    raise
                    
            _list_dir(dir_path)
            
            # 有序展示文件列表
            if files:
                display_files = files[:20] if len(files) > 20 else files
                logger.info(f"本地目录 {dir_path} 扫描完成，找到 {len(files)} 个文件: {display_files}")
                if len(files) > 20:
                    logger.debug(f"... 还有 {len(files) - 20} 个文件未在日志中显示 ...")
            else:
                logger.info(f"本地目录 {dir_path} 扫描完成，未找到任何文件")
                
            return files
            
        except Exception as e:
            logger.error(f"获取本地文件列表失败: {str(e)}")
            return []
            
    def _extract_file_info(self, file_dict):
        """从文件字典中提取文件信息
        Args:
            file_dict: 文件信息字典
        Returns:
            dict: 标准化的文件信息
        """
        try:
            if isinstance(file_dict, dict):
                # 如果没有 server_filename，从路径中提取
                server_filename = file_dict.get('server_filename', '')
                if not server_filename and file_dict.get('path'):
                    server_filename = file_dict['path'].split('/')[-1]
                    
                return {
                    'server_filename': server_filename,
                    'fs_id': file_dict.get('fs_id', ''),
                    'path': file_dict.get('path', ''),
                    'size': file_dict.get('size', 0),
                    'isdir': file_dict.get('isdir', 0)
                }
            return None
        except Exception as e:
            logger.error(f"提取文件信息失败: {str(e)}")
            return None

    def _list_shared_dir_files(self, path, uk, share_id, bdstoken):
        """递归获取共享目录下的所有文件
        Args:
            path: 目录路径
            uk: 用户uk
            share_id: 分享ID
            bdstoken: token
        Returns:
            list: 文件列表
        """
        files = []
        try:
            # 分页获取所有文件
            page = 1
            page_size = 100
            all_sub_files = []
            
            while True:
                sub_paths = self.client.list_shared_paths(
                    path.path,
                    uk,
                    share_id,
                    bdstoken,
                    page=page,
                    size=page_size
                )
                
                if isinstance(sub_paths, list):
                    sub_files = sub_paths
                elif isinstance(sub_paths, dict):
                    sub_files = sub_paths.get('list', [])
                else:
                    logger.error(f"子目录内容格式错误: {type(sub_paths)}")
                    break
                
                if not sub_files:
                    # 没有更多文件了
                    break
                
                all_sub_files.extend(sub_files)
                
                # 如果当前页文件数少于页大小，说明已经是最后一页
                if len(sub_files) < page_size:
                    break
                
                page += 1
            
            logger.info(f"目录 {path.path} 共获取到 {len(all_sub_files)} 个文件/子目录")
            
            sub_files = all_sub_files
                
            for sub_file in sub_files:
                if hasattr(sub_file, '_asdict'):
                    sub_file_dict = sub_file._asdict()
                else:
                    sub_file_dict = sub_file if isinstance(sub_file, dict) else {}
                    
                # 如果是目录，递归获取
                if sub_file.is_dir:
                    logger.info(f"递归处理子目录: {sub_file.path}")
                    sub_dir_files = self._list_shared_dir_files(sub_file, uk, share_id, bdstoken)
                    files.extend(sub_dir_files)
                else:
                    # 如果是文件，添加到列表
                    file_info = self._extract_file_info(sub_file_dict)
                    if file_info:
                        # 去掉路径中的 sharelink 部分
                        file_info['path'] = re.sub(r'^/sharelink\d*-\d+/?', '', sub_file.path)
                        # 去掉开头的斜杠
                        file_info['path'] = file_info['path'].lstrip('/')
                        files.append(file_info)
                        logger.debug(f"记录共享文件: {file_info}")
                
        except Exception as e:
            logger.error(f"获取目录 {path.path} 内容失败: {str(e)}")
            
        return files

    def update_user(self, username, cookies):
        """更新用户信息
        Args:
            username: 用户名
            cookies: 新的cookies字符串
        Returns:
            bool: 是否成功
        """
        try:
            if not username:
                raise ValueError("用户名不能为空")
            
            if username not in self.config['baidu']['users']:
                raise ValueError(f"用户 {username} 不存在")
            
            # 验证新cookies是否有效
            cookies_dict = self._parse_cookies(cookies)
            if not self._validate_cookies(cookies_dict):
                raise ValueError("无效的cookies格式")
            
            # 验证cookies是否可用
            try:
                temp_api = BaiduPCSApi(cookies=cookies_dict)
                user_info = temp_api.user_info()
                if not user_info:
                    raise ValueError("Cookies无效")
            except Exception as e:
                raise ValueError(f"验证cookies失败: {str(e)}")
            
            # 更新用户信息
            self.config['baidu']['users'][username].update({
                'cookies': cookies,
                'name': username,
                'user_id': username
            })
            
            self._save_config()
            
            # 如果更新的是当前用户,重新初始化客户端
            if username == self.config['baidu']['current_user']:
                self._init_client()
                # 清除用户信息缓存
                self._clear_user_info_cache()
            
            logger.success(f"更新用户成功: {username}")
            return True
            
        except Exception as e:
            logger.error(f"更新用户失败: {str(e)}")
            return False

    def get_user(self, username):
        """获取用户信息
        Args:
            username: 用户名
        Returns:
            dict: 用户信息,不存在返回None
        """
        try:
            if not username:
                return None
            
            if username not in self.config['baidu']['users']:
                return None
            
            user_info = self.config['baidu']['users'][username]
            return {
                'username': username,
                'name': user_info.get('name', username),
                'user_id': user_info.get('user_id', username),
                'cookies': user_info.get('cookies', '')
            }
            
        except Exception as e:
            logger.error(f"获取用户信息失败: {str(e)}")
            return None

    def update_task(self, index, task_data):
        """更新任务信息"""
        try:
            tasks = self.config['baidu']['tasks']
            if not (0 <= index < len(tasks)):
                raise ValueError("任务索引无效")
            
            # 保存旧任务配置用于比较
            old_task = tasks[index].copy()
            
            # 验证和清理数据
            url = task_data.get('url', '').strip()
            if not url:
                raise ValueError("分享链接不能为空")
            
            # 移除hash部分
            url = url.split('#')[0]
            
            # 验证URL格式
            if not re.match(r'^https?://pan\.baidu\.com/s/[a-zA-Z0-9_-]+(\?pwd=[a-zA-Z0-9]+)?$', url):
                raise ValueError("无效的百度网盘分享链接格式")
            
            # 更新任务信息
            tasks[index].update({
                'name': task_data.get('name', '').strip() or old_task.get('name', ''),
                'url': url,
                'save_dir': task_data.get('save_dir', '').strip() or old_task.get('save_dir', ''),
                'pwd': task_data.get('pwd') if task_data.get('pwd') is not None else old_task.get('pwd'),
                'status': 'pending',  # 重置任务状态
                'last_update': int(time.time())  # 添加更新时间戳
            })
            
            # 处理分类字段
            if 'category' in task_data:
                category = task_data['category'].strip()
                if category:  # 如果有新分类
                    tasks[index]['category'] = category
                else:  # 如果分类为空，删除分类字段
                    tasks[index].pop('category', None)
            
            # 处理cron字段
            new_cron = task_data.get('cron')
            if new_cron is not None:
                if isinstance(new_cron, str) and new_cron.strip():
                    tasks[index]['cron'] = new_cron.strip()
                else:
                    # 如果新cron为空或无效,删除cron字段
                    tasks[index].pop('cron', None)
            
            # 保存配置并更新调度器
            self._save_config()
            
            # 更新调度器
            from scheduler import TaskScheduler
            if hasattr(TaskScheduler, 'instance') and TaskScheduler.instance:
                TaskScheduler.instance.update_task_schedule(url, tasks[index].get('cron'))
                logger.info(f"已更新任务调度: {url}")
            
            logger.success(f"更新任务成功: {tasks[index]}")
            return True, True  # 第二个True表示调度器已更新
            
        except Exception as e:
            logger.error(f"更新任务失败: {str(e)}")
            return False, False

    def get_task_categories(self):
        """获取所有任务分类
        Returns:
            list: 分类列表
        """
        try:
            tasks = self.config['baidu'].get('tasks', [])
            # 收集所有非空的分类
            categories = {task.get('category') for task in tasks if task.get('category') and task.get('category').strip()}
            # 返回排序后的分类列表，过滤掉空值
            return sorted([cat for cat in categories if cat])
        except Exception as e:
            logger.error(f"获取任务分类失败: {str(e)}")
            return []

    def get_tasks_by_category(self, category=None):
        """获取指定分类的任务
        Args:
            category: 分类名称，None表示获取未分类任务
        Returns:
            list: 任务列表
        """
        try:
            tasks = self.config['baidu'].get('tasks', [])
            if category is None:
                # 返回未分类的任务
                return [task for task in tasks if 'category' not in task]
            else:
                # 返回指定分类的任务
                return [task for task in tasks if task.get('category') == category]
        except Exception as e:
            logger.error(f"获取分类任务失败: {str(e)}")
            return []

    def remove_tasks(self, orders):
        """批量删除转存任务
        Args:
            orders: 要删除的任务顺序列表
        Returns:
            int: 成功删除的任务数量
        """
        try:
            if not orders:
                return 0
            
            tasks = self.config['baidu']['tasks']
            original_count = len(tasks)
            
            # 使用列表推导式过滤掉要删除的任务
            self.config['baidu']['tasks'] = [
                task for task in tasks 
                if task.get('order') not in orders
            ]
            
            # 计算实际删除的任务数
            deleted_count = original_count - len(self.config['baidu']['tasks'])
            
            if deleted_count > 0:
                # 保存配置并更新调度器
                self._save_config(update_scheduler=True)
                # 重新整理剩余任务的顺序
                self._update_task_orders()
                logger.success(f"批量删除任务成功: 删除了{deleted_count}个任务")
            
            return deleted_count
            
        except Exception as e:
            logger.error(f"批量删除任务失败: {str(e)}")
            raise

    def update_task_status_by_order(self, order, status, message=None, error=None, transferred_files=None):
        """基于order更新任务状态
        Args:
            order: 任务顺序号
            status: 任务状态 (normal/error)
            message: 状态消息
            error: 错误信息（如果有）
            transferred_files: 成功转存的文件列表
        """
        try:
            tasks = self.config['baidu']['tasks']
            for task in tasks:
                if task.get('order') == order:
                    # 状态转换逻辑
                    if message and ('成功' in message or '没有新文件需要转存' in message):
                        task['status'] = 'normal'
                    elif status in ['success', 'skipped', 'pending', 'running']:
                        task['status'] = 'normal'
                    else:
                        task['status'] = 'error'
                        
                    if message:
                        task['message'] = message
                    if error:
                        task['error'] = error
                        task['status'] = 'error'  # 如果有错误信息，强制设置为错误状态
                    elif status == 'error' and message:
                        task['error'] = message
                    if transferred_files:
                        task['transferred_files'] = transferred_files
                    
                    # 添加最后执行时间
                    task['last_execute_time'] = int(time.time())
                    
                    self._save_config()
                    logger.info(f"已更新任务状态: order={order} -> {task['status']} ({message})")
                    return True
            return False
        except Exception as e:
            logger.error(f"更新任务状态失败: {str(e)}")
            return False

    def remove_task_by_order(self, order):
        """基于order删除转存任务
        Args:
            order: 任务顺序号
        Returns:
            bool: 是否删除成功
        """
        try:
            tasks = self.config['baidu']['tasks']
            for i, task in enumerate(tasks):
                if task.get('order') == order:
                    tasks.pop(i)
                    # 确保更新调度器
                    self._save_config(update_scheduler=True)
                    logger.success(f"删除任务成功: order={order}")
                    return True
            logger.warning(f"未找到任务: order={order}")
            return False
        except Exception as e:
            logger.error(f"删除任务失败: {str(e)}")
            return False

    def update_task_by_order(self, order, task_data):
        """基于order更新任务信息
        Args:
            order: 任务顺序号
            task_data: 新的任务数据
        Returns:
            bool: 是否更新成功
        """
        try:
            tasks = self.config['baidu']['tasks']
            task_index = None
            for i, task in enumerate(tasks):
                if task.get('order') == order:
                    task_index = i
                    break
                    
            if task_index is None:
                raise ValueError(f"未找到任务: order={order}")
            
            # 保存旧任务配置用于比较
            old_task = tasks[task_index].copy()
            
            # 验证和清理数据
            url = task_data.get('url', '').strip()
            if not url:
                raise ValueError("分享链接不能为空")
            
            # 移除hash部分
            url = url.split('#')[0]
            
            # 验证URL格式
            if not re.match(r'^https?://pan\.baidu\.com/s/[a-zA-Z0-9_-]+(\?pwd=[a-zA-Z0-9]+)?$', url):
                raise ValueError("无效的百度网盘分享链接格式")
            
            # 更新任务信息
            tasks[task_index].update({
                'name': task_data.get('name', '').strip() or old_task.get('name', ''),
                'url': url,
                'save_dir': task_data.get('save_dir', '').strip() or old_task.get('save_dir', ''),
                'pwd': task_data.get('pwd') if task_data.get('pwd') is not None else old_task.get('pwd'),
                'status': task_data.get('status', old_task.get('status', 'normal')),  # 保持原有状态
                'message': task_data.get('message', old_task.get('message', '')),  # 保持原有消息
                'last_update': int(time.time())  # 添加更新时间戳
            })
            
            # 处理分类字段
            if 'category' in task_data:
                category = task_data['category'].strip()
                if category:  # 如果有新分类
                    tasks[task_index]['category'] = category
                else:  # 如果分类为空，删除分类字段
                    tasks[task_index].pop('category', None)
            
            # 处理cron字段
            new_cron = task_data.get('cron')
            if new_cron is not None:
                if isinstance(new_cron, str) and new_cron.strip():
                    tasks[task_index]['cron'] = new_cron.strip()
                else:
                    # 如果新cron为空或无效,删除cron字段
                    tasks[task_index].pop('cron', None)
            
            # 保存配置并更新调度器
            self._save_config()
            
            # 更新调度器
            from scheduler import TaskScheduler
            if hasattr(TaskScheduler, 'instance') and TaskScheduler.instance:
                TaskScheduler.instance.update_task_schedule(url, tasks[task_index].get('cron'))
                logger.info(f"已更新任务调度: {url}")
            
            logger.success(f"更新任务成功: {tasks[task_index]}")
            return True
            
        except Exception as e:
            logger.error(f"更新任务失败: {str(e)}")
            return False

    def ensure_dir_exists(self, remote_dir):
        """确保远程目录存在，如果不存在则创建"""
        try:
            if not remote_dir.startswith('/'):
                remote_dir = '/' + remote_dir
                
            # 检查目录是否存在
            cmd = f'BaiduPCS-Py ls "{remote_dir}"'
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
            
            # 如果目录不存在，则创建
            if result.returncode != 0 and "No such file or directory" in result.stderr:
                cmd = f'BaiduPCS-Py mkdir "{remote_dir}"'
                result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
                
                if result.returncode != 0:
                    raise Exception(f"创建目录失败: {result.stderr}")
                    
            return True
        except Exception as e:
            logger.error(f"确保目录存在失败: {str(e)}")
            raise

    def share_file(self, remote_path, password=None, period_days=None):
        """分享远程文件或目录
        
        Args:
            remote_path: 要分享的远程路径
            password: 分享密码，4个字符，可选
            period_days: 有效期，单位为天，可选
            
        Returns:
            dict: 包含分享结果的字典
        """
        try:
            if not remote_path.startswith('/'):
                remote_path = '/' + remote_path
                
            # 验证密码长度
            if password and len(password) != 4:
                return {'success': False, 'error': '密码必须是4个字符'}
            
            # 先检查目录是否存在，如果不存在则创建
            try:
                logger.info(f"检查目录是否存在: {remote_path}")
                self.client.list(remote_path)
                logger.info(f"目录已存在: {remote_path}")
            except Exception as e:
                logger.info(f"目录不存在，尝试创建: {remote_path}")
                if not self._ensure_dir_tree_exists(remote_path):
                    error_msg = f"无法创建目录: {remote_path}"
                    logger.error(error_msg)
                    return {'success': False, 'error': error_msg}
                logger.success(f"成功创建目录: {remote_path}")
            
            # 调用API分享文件
            # BaiduPCSApi.share方法要求password参数，如果为None则传空字符串
            # period参数为0表示永久有效
            logger.info(f"开始分享文件: {remote_path}")
            link = self.client.share(
                remote_path, 
                password=password or "", 
                period=period_days or 0
            )
            
            # 构建返回结果
            share_info = {
                'url': link.url,
                'password': link.password,
                'create_time': int(time.time()),
                'period_days': period_days,
                'remote_path': remote_path
            }
            
            logger.success(f"分享文件成功: {remote_path} -> {link.url}")
            return {
                'success': True,
                'share_info': share_info
            }
                
        except Exception as e:
            logger.error(f"分享文件失败: {str(e)}")
            return {'success': False, 'error': str(e)}

    def update_task_share_info(self, task_order, share_info):
        """更新任务的分享信息
        
        Args:
            task_order: 任务的order
            share_info: 分享信息字典
        """
        try:
            tasks = self.list_tasks()
            for task in tasks:
                if task.get('order') == task_order:
                    task['share_info'] = share_info
                    self._save_config()
                    return True
            return False
        except Exception as e:
            logger.error(f"更新任务分享信息失败: {str(e)}")
            return False
