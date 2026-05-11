# FreeRouting Auto-Router Integration

[中文](./README.md)

With this extension, you can directly push PCB files to the open-source auto-routing tool FreeRouting without manually running FreeRouting or performing import/export operations for auto-routing files. It enables one-click auto-routing, providing a new option for PCB auto-routing.

## Features

- **Quick Auto-Routing** - One-click start, uses optimized default parameters to quickly complete PCB routing. Real-time progress is displayed via a progress bar during the routing process
- **Custom Routing** - Configure routing parameters through a visual panel (max passes, via cost, thread count, etc.) to meet different design needs
- **Real-time Preview** - During routing, intermediate results are automatically fetched every few seconds and updated on the canvas, allowing you to view routing effects in real time
- **Stop Routing** - Supports stopping routing at any time while preserving the current routing results
- **Auto DRC** - Automatically performs design rule checks after routing is completed
- **Layer Name Conversion** - Automatically converts FreeRouting layer names to JLCPCB EDA format

## Important Notes

- **Runtime Environment** - This extension only supports JLCPCB EDA Professional Edition V3.2 and above.
- **Does Not Preserve Existing Routing** - Each time auto-routing is executed, all existing wires and vias on the PCB (unlocked) will be cleared, and then FreeRouting's routing results will be imported. If you need to preserve some manual routing, please lock the corresponding wires and vias first.
- **Routing Progress Refresh** - Because FreeRouting does not support incremental routing result writing, each canvas progress refresh clears old data first and then imports new results, which may cause the canvas to flicker.

## Usage

### Installation

1. Download and install the latest version of FreeRouting (V2.2.3 and above). [Download FreeRouting](https://github.com/freerouting/freerouting/releases)
2. Open JLCPCB EDA Professional Edition, go to the top menu: Advanced - Extension Manager, find FreeRouting, and click Install
3. Or download the extension package eext file and import it via the top menu: Advanced - Extension Manager - Import eext file
4. After installation, go to the installed list, click FreeRouting, and enable "**External Interaction**" in the configuration (must be enabled, otherwise it cannot connect to the FreeRouting service)

![Extension Configuration](images/ext-setting-cn.jpg)

### Start FreeRouting Service

Before use, you need to start the FreeRouting API service first. Run the corresponding startup script based on your operating system:

| Platform | Script |
|----------|--------|
| Windows | `scripts/start-freerouting-windows.bat` |
| Linux | `scripts/start-freerouting-linux.sh` |
| macOS | `scripts/start-freerouting-mac.sh` |

The script will automatically search for the locally installed FreeRouting and start the API service (port 37864) with no GUI and authentication disabled.

If the service is not started, clicking the routing menu will prompt a dialog with operation steps, download links, and startup script downloads.

### Quick Routing

1. Run the startup script to start the FreeRouting service
2. Open a PCB document in JLCPCB EDA Professional Edition
3. Click the menu **FreeRouting → Quick Auto-Route**
4. Wait for routing to complete, and the results will be automatically imported. A progress bar is displayed during routing, and you can stop at any time via **FreeRouting → Stop Routing**

### Custom Routing

1. Click the menu **FreeRouting → Custom Auto-Route...**
2. In the popup panel, configure routing parameters on the left and view running logs on the right

![Custom Routing Panel](images/setting.jpg)

3. Configurable parameters include: max passes, via cost, max threads, improvement threshold, pull tight accuracy, ripup cost, automatic neckdown, allow multiple via types, auto DRC after completion
4. Click **Start Routing** to begin. During routing, the button changes to **Stop Routing**, which you can click to stop at any time
5. During routing, intermediate results are automatically fetched every few seconds and updated on the canvas

### Routing Parameter Descriptions

| Parameter | Default Value | Description |
|-----------|---------------|-------------|
| Max Passes (max_passes) | 100 (custom) / 50 (quick) | Number of routing iterations |
| Via Cost (via_costs) | 50 | Cost weight of vias; higher values result in fewer vias used |
| Max Threads (max_threads) | 4 | Number of threads for parallel routing |
| Improvement Threshold (improvement_threshold) | 0 | Controls the stopping condition; 0 means full routing |
| Pull Tight Accuracy (trace_pull_tight_accuracy) | 500 | Precision of trace pull tight |
| Ripup Cost (start_ripup_costs) | 100 | Starting cost of ripping up existing traces |
| Automatic Neckdown (automatic_neckdown) | Enabled | Automatically reduces trace width in narrow areas |
| Allowed Via Types (allowed_via_types) | Allowed | Allows the use of different types of vias |
| Auto DRC After Completion | Enabled | Automatically performs design rule check after routing is completed |

## Acknowledgements

1. Thanks to the [Freerouting project](https://github.com/freerouting/freerouting/releases) and authors such as [andrasfuchs](https://github.com/andrasfuchs) for providing the Freerouting tool and API capabilities
2. Thanks to Freerouting contributor [L1uTongweiNewAccount](https://github.com/L1uTongweiNewAccount) for helping with Freerouting API adaptation
