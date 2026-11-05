
# FreeRouting 自动布线器集成

[English](./README_EN.md)

通过本扩展你可以直接把PCB文件推送给开源自动布线工具Freerouting，并且不需要手动运行Freerouting，并操作导入导出自动布线文件，实现一键自动布线，为PCB自动布线提供新的选择。

## 功能特性

- **快速自动布线** - 一键启动，使用优化的默认参数快速完成 PCB 布线，布线过程中通过进度条实时显示进度
- **自定义布线** - 通过可视化面板配置布线参数（最大轮数、过孔成本、线程数等），满足不同设计需求
- **实时预览** - 布线过程中每隔数秒自动获取中间结果并更新到画布，实时查看布线效果
- **停止布线** - 支持随时停止布线，保留当前已有的布线结果
- **自动 DRC** - 布线完成后可自动执行设计规则检查
- **层名转换** - 自动将 FreeRouting 层名转换为嘉立创EDA格式

## 注意事项

- **运行环境** - 本扩展仅支持嘉立创EDA专业版 V3.2 及以上版本。
- **不支持保留已有布线** - 每次执行自动布线时，会清除 PCB 上现有的所有导线和过孔（未锁定的），然后导入 FreeRouting 的布线结果。如需保留部分手动布线，请先锁定对应的导线和过孔。
- **刷新布线进度** - 因为 FreeRouting 不支持增量布线结果写入，所以每次刷新画布进度是先清理旧数据再导入新结果，会看到画布有闪烁现象。

## 使用方法

### 安装方式

1. 下载并安装 FreeRouting 最新版本（V2.2.3 及以上）。[下载 FreeRouting](https://github.com/freerouting/freerouting/releases)
2. 打开嘉立创EDA专业版，在顶部菜单：高级 - 扩展管理器，找到 FreeRouting，点击安装
3. 或者下载扩展包 eext 文件，在顶部菜单：高级 - 扩展管理器 - 导入 eext 文件导入
4. 安装后点击到已安装列表，点击 FreeRouting，在配置处开启允许"**外部交互**"（必须开启，否则无法连接 FreeRouting 服务）

![扩展配置](images/ext-setting-cn.jpg)

### 启动 FreeRouting 服务

使用前需要先启动 FreeRouting API 服务。根据你的操作系统，运行对应的启动脚本：

| 平台 | 脚本 |
|------|------|
| Windows | `scripts/start-freerouting-windows.bat` |
| Linux | `scripts/start-freerouting-linux.sh` |
| macOS | `scripts/start-freerouting-mac.sh` |

脚本会自动查找本地安装的 FreeRouting，以无 GUI、禁用认证的方式启动 API 服务（端口 37864）。

如果未启动服务，点击布线菜单时扩展会弹窗提示操作步骤，并提供下载链接和启动脚本下载。

### 快速布线

1. 运行启动脚本启动 FreeRouting 服务
2. 在嘉立创EDA专业版中打开 PCB 文档
3. 点击菜单 **FreeRouting → 直接自动布线**
4. 等待布线完成，结果自动导入。布线过程中会显示进度条，可通过 **FreeRouting → 停止布线** 随时停止

### 自定义布线

1. 点击菜单 **FreeRouting → 自定义自动布线...**
2. 在弹出的面板中，左侧配置布线参数，右侧查看运行日志

![自定义布线面板](images/setting.jpg)

3. 可配置的参数包括：最大轮数、过孔成本、最大线程数、改进阈值、拉紧精度、撕裂成本、自动缩颈、允许多种过孔、完成后自动 DRC
4. 点击 **开始布线** 开始，布线过程中按钮变为 **停止布线**，点击可随时停止
5. 布线过程中每隔数秒自动获取中间结果并更新到画布

### 布线参数说明

| 参数 | 默认值 | 说明 |
|------|--------|------|
| 最大轮数 (max_passes) | 100 (自定义) / 50 (快速) | 布线迭代次数 |
| 过孔成本 (via_costs) | 50 | 过孔的成本权重，越高越少使用过孔 |
| 最大线程数 (max_threads) | 4 | 并行布线的线程数 |
| 改进阈值 (improvement_threshold) | 0 | 控制停止条件，0 表示完全布线 |
| 拉紧精度 (trace_pull_tight_accuracy) | 500 | 走线拉紧的精度 |
| 撕裂成本 (start_ripup_costs) | 100 | 撕裂已有走线的起始成本 |
| 自动缩颈 (automatic_neckdown) | 启用 | 自动在狭窄区域缩小走线宽度 |
| 允许多种过孔 (allowed_via_types) | 允许 | 允许使用不同类型的过孔 |
| 完成后自动 DRC | 启用 | 布线完成后自动执行设计规则检查 |

## 鸣谢

1. 感谢 [Freerouting项目](https://github.com/freerouting/freerouting/releases)，感谢[andrasfuchs](https://github.com/andrasfuchs)等作者提供的Freerouting工具及API能力
2. 感谢 Freerouting贡献者 [L1uTongweiNewAccount](https://github.com/L1uTongweiNewAccount) 帮助Freerouting API的适配
