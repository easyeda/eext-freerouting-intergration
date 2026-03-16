
# FreeRouting 自动布线器集成 / FreeRouting Auto-Router Integration

通过本扩展你可以直接把PCB文件推送给开源自动布线工具Freerouting，并且不需要手动运行Freerouting，并操作导入导出自动布线文件，实现一键自动布线，为PCB自动布线提供新的选择。 

With this extension, you can directly push PCB files to the open-source auto-routing tool FreeRouting without manually running FreeRouting or handling import/export of routing files, enabling one-click auto-routing and providing a new option for PCB automatic routing.

## 功能特性 / Features

- **快速自动布线** - 一键启动，使用优化的默认参数快速完成 PCB 布线 
- **Quick Auto-Routing** - One-click startup with optimized default parameters for fast PCB routing
- **自定义布线** - 通过可视化面板配置布线参数，满足不同设计需求 
- **Custom Routing** - Configure routing parameters through a visual panel to meet different design requirements
- **实时进度反馈** - 布线过程中实时显示进度、统计信息和日志 
- **Real-time Progress Feedback** - Real-time display of progress, statistics, and logs during routing
- **层名转换** - 自动将 FreeRouting 层名转换为嘉立创EDA格式 
- **Layer Name Conversion** - Automatically converts FreeRouting layer names to EasyEDA format

## 使用方法 / Usage

### 安装方式 / Installation

1. 打开嘉立创EDA专业版，在顶部菜单：高级 - 扩展管理器，找到Freerouting，点击安装 
2. Open JLCEDA Professional, go to top menu: Advanced - Extension Manager, find FreeRouting, and click Install
3. 或者下载扩展包eext文件，在顶部菜单：高级 - 扩展管理器 - 导入 eext 文件导入 
4. Or download the .eext extension package, go to top menu: Advanced - Extension Manager - Import .eext file
5. 安装后点击到已安装列表，点击Freerouting，在配置处开启允许"**外部交互**"和"**在顶部菜单显示**"（不勾选则在高级菜单显示） 
6. After installation, go to Installed list, click FreeRouting, and enable "**External Interaction**" and "**Show in Top Menu**" in settings (if unchecked, it will show in Advanced menu)
7. 下载并安装Freerouting最新版本，需V2.2.0(未发布)及以上。[下载Freerouting](https://github.com/freerouting/freerouting/releases ) 
8. Download and install the latest FreeRouting version (V2.2.0(not release yet) or above). [Download FreeRouting](https://github.com/freerouting/freerouting/releases )

### 快速布线 / Quick Routing

1. 在嘉立创EDA专业版中打开 PCB 文档 
2. Open a PCB document in EasyEDA Professional
3. 点击菜单 **FreeRouting → 自动布线**，会提示是否运行打开Freerouting，点击允许，会自动启动Freerouting 
4. Click menu **FreeRouting → Auto Route**, you will be prompted to open FreeRouting, click Allow, and FreeRouting will launch automatically
5. 等待布线完成，结果自动导入 
6. Wait for routing completion, results will be imported automatically

### 自定义布线 / Custom Routing

1. 点击菜单 **FreeRouting → 自动布线(自定义)...** 
2. Click menu **FreeRouting → Auto Route(Custom)...**
3. 在弹出的配置面板中设置参数： 
4. Set parameters in the popup configuration panel:
   - **最大轮数**: 布线迭代次数 (默认 100) 
   - **Max Passes**: Routing iteration count (default: 100)
   - **高级设置**: 勾选后可配置更多参数 
   - **Advanced Settings**: Check to configure more parameters
5. 点击 **开始布线** 
6. Click **Start Routing**

### 高级参数说明 / Advanced Parameters

| 参数 / Parameter | 默认值 / Default | 说明 / Description |
|------|--------|------|
| 过孔成本 (via_costs) / Via Cost (via_costs) | 50 | 过孔的成本权重，越高越少使用过孔 / Cost weight for vias, higher values result in fewer vias |
| 最大线程数 (max_threads) / Max Threads (max_threads) | 4 | 并行布线的线程数 / Number of threads for parallel routing |
| 扇出轮数 (fanout_max_passes) / Fanout Max Passes (fanout_max_passes) | 20 | 扇出阶段的最大迭代轮数 / Maximum iteration passes for fanout stage |
| 改进阈值 (improvement_threshold) / Improvement Threshold (improvement_threshold) | 0 | 控制停止条件，0 表示完全布线 / Controls stop condition, 0 means complete routing |
| 拉紧精度 (trace_pull_tight_accuracy) / Trace Pull Tight Accuracy (trace_pull_tight_accuracy) | 500 | 走线拉紧的精度 / Accuracy for trace pull-tight optimization |
| 撕裂成本 (start_ripup_costs) / Start Ripup Costs (start_ripup_costs) | 100 | 撕裂已有走线的起始成本 / Starting cost for ripping up existing traces |
| 自动缩颈 (automatic_neckdown) / Automatic Neckdown (automatic_neckdown) | 启用 / Enabled | 自动在狭窄区域缩小走线宽度 / Automatically reduce trace width in narrow areas |
| 允许多种过孔 (allowed_via_types) / Allowed Via Types (allowed_via_types) | 允许 / Allowed | 允许使用不同类型的过孔 / Allow using different types of vias |

## 鸣谢 / Acknowledgments

1. 感谢 [Freerouting项目](https://github.com/freerouting/freerouting/releases ) ，感谢[andrasfuchs](https://github.com/andrasfuchs )等作者提供的Freerouting工具及API能力 
2. Thanks to the [FreeRouting Project](https://github.com/freerouting/freerouting/releases ) and authors like [andrasfuchs](https://github.com/andrasfuchs ) for providing the FreeRouting tool and API capabilities
3. 感谢 Freerouting贡献者 [L1uTongweiNewAccount](https://github.com/L1uTongweiNewAccount ) 帮助Freerouting API的适配 
4. Thanks to FreeRouting contributor [L1uTongweiNewAccount](https://github.com/L1uTongweiNewAccount ) for helping adapt the FreeRouting API
