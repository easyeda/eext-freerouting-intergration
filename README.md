# FreeRouting 自动布线器集成

通过本扩展你可以直接把PCB文件推送给开源自动布线工具Freerouting，并且不需要手动运行Freerouting，并操作导入导出自动布线文件，实现一键自动布线，为PCB自动布线提供新的选择。

## 功能特性

- **快速自动布线** - 一键启动，使用优化的默认参数快速完成 PCB 布线
- **自定义布线** - 通过可视化面板配置布线参数，满足不同设计需求
- **实时进度反馈** - 布线过程中实时显示进度、统计信息和日志
- **层名转换** - 自动将 FreeRouting 层名转换为嘉立创EDA格式

## 使用方法

### 安装方式

1. 打开嘉立创EDA专业版，在顶部菜单：高级 - 扩展管理器，找到Freerouting，点击安装
2. 或者下载扩展包eext文件，在顶部菜单：高级 - 扩展管理器 - 导入 eext 文件导入
3. 安装后点击到已安装列表，点击Freerouting，在配置处开启允许“**外部交互**”和“**在顶部菜单显示**”（不勾选则在高级菜单显示）
4. 下载并安装Freerouting最新版本，需V2.2.0及以上。[下载Freerouting](https://github.com/freerouting/freerouting/releases)

### 快速布线

1. 在嘉立创EDA专业版中打开 PCB 文档
2. 点击菜单 **FreeRouting → 自动布线**，会提示是否运行打开Freerouting，点击允许，会自动启动Freerouting
3. 等待布线完成，结果自动导入

### 自定义布线

1. 点击菜单 **FreeRouting → 自动布线(自定义)**
2. 在弹出的配置面板中设置参数：
   - **最大轮数**: 布线迭代次数 (默认 100)
   - **高级设置**: 勾选后可配置更多参数
3. 点击 **开始布线**

### 高级参数说明

| 参数 | 默认值 | 说明 |
|------|--------|------|
| 过孔成本 (via_costs) | 50 | 过孔的成本权重，越高越少使用过孔 |
| 最大线程数 (max_threads) | 4 | 并行布线的线程数 |
| 扇出轮数 (fanout_max_passes) | 20 | 扇出阶段的最大迭代轮数 |
| 改进阈值 (improvement_threshold) | 0 | 控制停止条件，0 表示完全布线 |
| 拉紧精度 (trace_pull_tight_accuracy) | 500 | 走线拉紧的精度 |
| 撕裂成本 (start_ripup_costs) | 100 | 撕裂已有走线的起始成本 |
| 自动缩颈 (automatic_neckdown) | 启用 | 自动在狭窄区域缩小走线宽度 |
| 允许多种过孔 (allowed_via_types) | 允许 | 允许使用不同类型的过孔 |


## 鸣谢
1. 感谢 [Freerouting项目](https://github.com/freerouting/freerouting/releases) ，感谢[andrasfuchs](https://github.com/andrasfuchs)等作者提供的Freerouting工具及API能力
2. 感谢 Freerouting贡献者 [L1uTongweiNewAccount](https://github.com/L1uTongweiNewAccount) 帮助Freerouting API的适配
