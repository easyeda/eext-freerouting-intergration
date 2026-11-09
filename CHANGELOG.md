# 1.7.19 - 2026.11.09

- 直接自动布线改用独立进度弹窗，避免 EDA 共享进度条被其它任务/预览导入污染而卡在 66%
- 进度优先按 FreeRouting 日志中的真实未布通比例计算，无日志数据时使用时间兜底
- 进度弹窗压缩留白，停止按钮移到进度条右侧并加高
- 恢复每 10 秒将当前布线结果写入画布，写入后清理 EDA 导入进度条
- 自定义自动布线增加公共消息总线和扩展存储兜底通道，修复浏览器版“扩展未响应”
- 启动脚本控制台日志级别改为 INFO，恢复 FreeRouting 运行日志滚动输出
- 布线前增加外部交互权限检测与开启路径提示
- 状态查询、结果获取、SES 导入、DRC、DSN 生成增加超时，超时后释放锁并提示错误

# 1.7.1

- 多语言优化

# 1.7.0

- 全平台 FreeRouting 使用可执行文件直接启动，无需安装 JDK 25
- 更新 Linux 和 macOS 启动脚本，使用 freerouting 可执行文件
- 简化弹窗和文档，移除 JDK 25 相关说明

# 1.6.0

- Windows 版本 FreeRouting 使用 freerouting.exe 直接启动，无需安装 JDK 25
- 新增 start-freerouting-windows.bat 启动脚本
- 更新弹窗描述和文档，区分 Windows 和 Linux/Mac 的 JDK 要求

# 1.5.0 

- 支持手动启动 FreeRouting，添加多平台启动脚本（Windows/Mac/Linux）及服务检测
- 移除通过 URL Scheme 自动启动 FreeRouting


# 1.4.0 

- 通过 URL Scheme 自动启动 FreeRouting，移除代理依赖
- 添加翻译

# 1.3.0 

- 统一路由逻辑，更新 UI、README 及国际化
- 为路由日志和 iframe 语言检测添加完整 i18n 支持

# 1.2.0 

- 用进度条替代 toast 进度提示，修复 iframe 路由逻辑
- 添加实时预览、停止布线、国际化及 UX 改进
- 修改弹窗和交互

# 1.1.1 

- 第一个版本：添加 FreeRouting 自动布线器扩展功能
- 更新 extension.json 配置
- 添加 README 使用说明与英文翻译
