/**
 * 入口文件
 *
 * 本文件为默认扩展入口文件，如果你想要配置其它文件作为入口文件，
 * 请修改 `extension.json` 中的 `entry` 字段；
 *
 * 请在此处使用 `export`  导出所有你希望在 `headerMenus` 中引用的方法，
 * 方法通过方法名与 `headerMenus` 关联。
 *
 * 如需了解更多开发细节，请阅读：
 * https://prodocs.lceda.cn/cn/api/guide/
 */
import * as extensionConfig from '../extension.json';
import { FreeRoutingRouter } from './router/FreeRoutingRouter';
import { QUICK_ROUTE_OPTIONS, RoutingOptions } from './types';
import { showInfo, showSuccess, showError } from './utils/toast';
import { SESImporter } from './importer/SESImporter';
import { fileToBase64 } from './utils/base64';

// IFrame 窗口 ID
const IFRAME_ID = 'freerouting-config';

// MessageBus 订阅任务
let iframeMessageTask: { cancel: () => void } | null = null;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function activate(_status?: 'onStartupFinished', _arg?: string): void {}

export function about(): void {
	eda.sys_Dialog.showInformationMessage(
		eda.sys_I18n.text('EasyEDA extension SDK v', undefined, undefined, extensionConfig.version),
		eda.sys_I18n.text('About'),
	);
}

/**
 * 快速自动布线
 * 使用默认参数（50轮，启用JLCEDA转换）直接开始布线
 */
export async function autoRoute(): Promise<void> {
	showInfo('正在启动自动布线...');

	const router = new FreeRoutingRouter(
		// 进度回调
		(progress) => {
			console.log(`[FreeRouting] ${progress.stage}: ${progress.percentage}%`);
			// 显示进度吐司
			if (progress.stage && progress.percentage !== undefined) {
				showInfo(`${progress.stage}: ${progress.percentage}%`);
			}
		},
		// 日志回调 - 根据 WebSocket 返回信息显示吐司
		(message, level) => {
			console.log(`[FreeRouting] [${level}] ${message}`);
			// 根据日志级别显示不同类型的吐司
			switch (level) {
				case 'error':
					showError(message);
					break;
				case 'success':
					showSuccess(message);
					break;
				case 'warn':
					showInfo(message);
					break;
				// info 级别不显示吐司，避免过多提示
			}
		},
		// 状态回调
		(status) => {
			console.log(`[FreeRouting] 连接状态: ${status}`);
			if (status === 'connected') {
				showInfo('已连接到 FreeRouting 服务');
			} else if (status === 'disconnected') {
				showError('与 FreeRouting 服务断开连接');
			}
		},
	);

	try {
		const success = await router.route(QUICK_ROUTE_OPTIONS);
		if (success) {
			showSuccess('自动布线完成！');
		} else {
			showError('自动布线失败');
		}
	} catch (error) {
		console.error('[FreeRouting] 布线错误:', error);
		const message = error instanceof Error ? error.message : String(error);
		showError(`布线失败: ${message}`);
	}
}

/**
 * 自定义自动布线
 * 打开 IFrame 配置面板，允许用户自定义布线参数
 */
export async function autoRouteCustom(): Promise<void> {
	// 先设置 MessageBus 监听
	setupIFrameMessageListener();

	// 打开 IFrame 配置面板
	const opened = await eda.sys_IFrame.openIFrame(
		'./iframe/routing.html',
		800,
		600,
		IFRAME_ID,
		{
			maximizeButton: true,
			minimizeButton: true,
			buttonCallbackFn: (button) => {
				if (button === 'close') {
					// 关闭时清理资源
					cleanupIFrameResources();
				}
			},
		},
	);

	if (!opened) {
		cleanupIFrameResources();
	}
}

export async function testCors(): Promise<void> {
	// 先设置 MessageBus 监听
	setupIFrameMessageListener();

	// 打开 IFrame 配置面板
	const opened = await eda.sys_IFrame.openIFrame(
		'./iframe/test_cors.html',
		800,
		600,
	);

}

/**
 * 设置 IFrame 消息监听
 */
function setupIFrameMessageListener(): void {
	// 先清理之前的监听
	if (iframeMessageTask) {
		iframeMessageTask.cancel();
		iframeMessageTask = null;
	}

	// 订阅来自 IFrame 的消息
	iframeMessageTask = eda.sys_MessageBus.subscribe(
		'freerouting-iframe',
		async (message: { type: string; options?: RoutingOptions; data?: string; filename?: string }) => {
			console.log('[FreeRouting] 收到 IFrame 消息:', message.type);

			switch (message.type) {
				case 'start':
					await handleIFrameStart();
					break;

				case 'complete':
					await handleIFrameComplete(message.data, message.filename);
					break;

				case 'cancel':
					showInfo('布线已取消');
					break;
			}
		},
	);
}

/**
 * 处理 IFrame 开始布线请求
 */
async function handleIFrameStart(): Promise<void> {
	try {
		console.log('[FreeRouting] 正在获取 DSN 文件...');

		// 获取 DSN 文件
		const dsnFile = await eda.pcb_ManufactureData.getDsnFile();
		if (!dsnFile) {
			eda.sys_MessageBus.publish('freerouting-dsn', { error: '获取 DSN 文件失败' });
			showError('获取 DSN 文件失败，请确保已打开 PCB 文档');
			return;
		}

		console.log('[FreeRouting] DSN 文件获取成功:', dsnFile.name);

		// 编码为 Base64
		const dsnBase64 = await fileToBase64(dsnFile);

		// 发送 DSN 数据到 IFrame
		eda.sys_MessageBus.publish('freerouting-dsn', {
			data: dsnBase64,
			filename: dsnFile.name,
		});

		console.log('[FreeRouting] DSN 数据已发送到 IFrame');
	} catch (error) {
		console.error('[FreeRouting] 获取 DSN 文件错误:', error);
		const message = error instanceof Error ? error.message : String(error);
		eda.sys_MessageBus.publish('freerouting-dsn', { error: message });
		showError(`获取 DSN 文件失败: ${message}`);
	}
}

/**
 * 处理 IFrame 布线完成
 */
async function handleIFrameComplete(data?: string, filename?: string): Promise<void> {
	if (!data) {
		showError('未收到 SES 数据');
		return;
	}

	try {
		console.log('[FreeRouting] 正在导入 SES 文件...');
		const sesFilename = filename || 'routing_result.ses';
		const success = await SESImporter.import(data, sesFilename);

		if (success) {
			showSuccess('自动布线完成！');
			console.log('[FreeRouting] SES 文件导入成功');
		} else {
			showError('SES 文件导入失败');
			console.error('[FreeRouting] SES 文件导入失败');
		}
	} catch (error) {
		console.error('[FreeRouting] 导入 SES 文件错误:', error);
		const message = error instanceof Error ? error.message : String(error);
		showError(`导入失败: ${message}`);
	}
}

/**
 * 清理 IFrame 相关资源
 */
function cleanupIFrameResources(): void {
	if (iframeMessageTask) {
		iframeMessageTask.cancel();
		iframeMessageTask = null;
	}
}
