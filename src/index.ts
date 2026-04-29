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

// 当前活跃的路由器实例
let activeRouter: FreeRoutingRouter | null = null;

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
 * 使用默认参数直接开始布线
 */
export async function autoRoute(): Promise<void> {
	if (activeRouter?.isActive()) {
		showError('布线正在进行中，请先停止当前布线');
		return;
	}

	showInfo('正在启动自动布线...');
	await eda.pcb_Document.stopCalculatingRatline();

	const router = new FreeRoutingRouter(
		(progress) => {
			console.log(`[FreeRouting] ${progress.stage}: ${progress.percentage}%`);
			if (progress.stage && progress.message) {
				showInfo(progress.message);
			}
		},
		(message, level) => {
			console.log(`[FreeRouting] [${level}] ${message}`);
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
			}
		},
	);

	activeRouter = router;

	try {
		const success = await router.route(QUICK_ROUTE_OPTIONS);
		if (success) {
			showSuccess('自动布线完成！');
		} else {
			showInfo('布线已结束');
		}
	} catch (error) {
		console.error('[FreeRouting] 布线错误:', error);
		const message = error instanceof Error ? error.message : String(error);
		if (message !== '布线已取消') {
			showError(`布线失败: ${message}`);
		}
	} finally {
		activeRouter = null;
		await eda.pcb_Document.startCalculatingRatline();
	}
}

/**
 * 停止布线
 */
export async function stopRoute(): Promise<void> {
	if (activeRouter?.isActive()) {
		activeRouter.cancel();
		showInfo('正在停止布线...');
	} else {
		showInfo('当前没有正在进行的布线任务');
	}
}

/**
 * 自定义自动布线
 * 打开 IFrame 配置面板，允许用户自定义布线参数
 */
export async function autoRouteCustom(): Promise<void> {
	setupIFrameMessageListener();

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
					cleanupIFrameResources();
				}
			},
		},
	);

	if (!opened) {
		cleanupIFrameResources();
	}
}

function setupIFrameMessageListener(): void {
	if (iframeMessageTask) {
		iframeMessageTask.cancel();
		iframeMessageTask = null;
	}

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

				case 'preview':
					await handleIFramePreview(message.data, message.filename);
					break;

				case 'cancel':
					showInfo('布线已取消');
					break;
			}
		},
	);
}

async function handleIFrameStart(): Promise<void> {
	try {
		console.log('[FreeRouting] 正在获取 DSN 文件...');
		const dsnFile = await eda.pcb_ManufactureData.getDsnFile('design.dsn');
		if (!dsnFile) {
			eda.sys_MessageBus.publish('freerouting-dsn', { error: '获取 DSN 文件失败' });
			showError('获取 DSN 文件失败，请确保已打开 PCB 文档');
			return;
		}

		console.log('[FreeRouting] DSN 文件获取成功:', dsnFile.name);
		const dsnBase64 = await fileToBase64(dsnFile);

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

async function clearExistingRoutes(): Promise<void> {
	const lineIds = await eda.pcb_PrimitiveLine.getAllPrimitiveId(undefined, undefined, false);
	if (lineIds.length) await eda.pcb_PrimitiveLine.delete(lineIds);

	const arcIds = await eda.pcb_PrimitiveArc.getAllPrimitiveId(undefined, undefined, false);
	if (arcIds.length) await eda.pcb_PrimitiveArc.delete(arcIds);

	const viaIds = await eda.pcb_PrimitiveVia.getAllPrimitiveId(undefined, false);
	if (viaIds.length) await eda.pcb_PrimitiveVia.delete(viaIds);
}

async function handleIFramePreview(data?: string, filename?: string): Promise<void> {
	if (!data) return;
	try {
		console.log('[FreeRouting] 正在更新实时预览...');
		await clearExistingRoutes();
		const sesFilename = filename || 'routing_result.ses';
		await SESImporter.import(data, sesFilename);
	} catch (error) {
		console.warn('[FreeRouting] 预览导入失败:', error);
	}
}

async function handleIFrameComplete(data?: string, filename?: string): Promise<void> {
	if (!data) {
		showError('未收到 SES 数据');
		return;
	}

	try {
		console.log('[FreeRouting] 正在导入 SES 文件...');
		await clearExistingRoutes();
		const sesFilename = filename || 'routing_result.ses';
		const success = await SESImporter.import(data, sesFilename);

		if (success) {
			showSuccess('自动布线完成！');
		} else {
			showError('SES 文件导入失败');
		}
	} catch (error) {
		console.error('[FreeRouting] 导入 SES 文件错误:', error);
		const message = error instanceof Error ? error.message : String(error);
		showError(`导入失败: ${message}`);
	}
}

function cleanupIFrameResources(): void {
	if (iframeMessageTask) {
		iframeMessageTask.cancel();
		iframeMessageTask = null;
	}
}
