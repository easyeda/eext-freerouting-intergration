/**
 * 入口文件
 */
import * as extensionConfig from '../extension.json';
import { FreeRoutingRouter } from './router/FreeRoutingRouter';
import { QUICK_ROUTE_OPTIONS, RoutingOptions } from './types';
import { showInfo, showSuccess, showError, t } from './utils/toast';
import { SESImporter } from './importer/SESImporter';
import { fileToBase64 } from './utils/base64';

const IFRAME_ID = 'freerouting-config';
let iframeMessageTask: { cancel: () => void } | null = null;

const ROUTER_KEY = '__freerouting_active_router__';

function getActiveRouter(): FreeRoutingRouter | null {
	return (globalThis as any)[ROUTER_KEY] || null;
}

function setActiveRouter(router: FreeRoutingRouter | null): void {
	(globalThis as any)[ROUTER_KEY] = router;
}

let routeStartTime = 0;

function logToPanel(message: string, type: 'info' | 'warn' | 'error' = 'info'): void {
	eda.sys_Log.add(`[FreeRouting] ${message}`, type as any);
}

function formatDuration(ms: number): string {
	const s = Math.floor(ms / 1000);
	if (s < 60) return `${s}${t('s')}`;
	const m = Math.floor(s / 60);
	return `${m}${t('m')}${s % 60}${t('s')}`;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function activate(_status?: 'onStartupFinished', _arg?: string): void {}

export function about(): void {
	eda.sys_Dialog.showInformationMessage(
		eda.sys_I18n.text('EasyEDA extension SDK v', undefined, undefined, extensionConfig.version),
		eda.sys_I18n.text('About'),
	);
}

export async function autoRoute(): Promise<void> {
	if (getActiveRouter()?.isActive()) {
		showError(t('Routing in progress, please stop current routing first'));
		return;
	}

	showInfo(t('Starting auto-routing...'));
	await eda.pcb_Document.stopCalculatingRatline();
	await eda.pcb_Layer.setLayerInvisible(57 as any);

	routeStartTime = Date.now();
	logToPanel(`${t('Routing started')} - ${new Date(routeStartTime).toLocaleTimeString()}`);

	const router = new FreeRoutingRouter(
		(progress) => {
			if (progress.message) {
				showInfo(progress.message, true);
			}
		},
		(message, level) => {
			console.log(`[FreeRouting] [${level}] ${message}`);
		},
	);

	setActiveRouter(router);

	router
		.route(QUICK_ROUTE_OPTIONS)
		.then((result) => {
			const duration = Date.now() - routeStartTime;
			if (result.success) {
				showSuccess(t('Auto-routing completed!'));
				logToPanel(`${t('Routing completed')} - ${new Date().toLocaleTimeString()} | ${t('Duration: ')}${formatDuration(duration)}`);
				if (result.statistics) {
					const s = result.statistics;
					logToPanel(`${t('Result: routed nets ')}${s.routed_net_count ?? s.nets?.total_count ?? 0}${t(' vias ')}${s.via_count ?? s.vias?.total_count ?? 0}${t(' traces ')}${s.traces?.total_count ?? 0}`);
				}
			} else {
				showInfo(t('Routing finished'));
				logToPanel(`${t('Routing ended - incomplete')} - ${new Date().toLocaleTimeString()} | ${t('Duration: ')}${formatDuration(duration)}`);
			}
		})
		.catch((error) => {
			const duration = Date.now() - routeStartTime;
			const message = error instanceof Error ? error.message : String(error);
			if (message !== '布线已取消') {
				showError(`${t('Routing failed: ')}${message}`);
				logToPanel(`${t('Routing failed')} - ${t('Duration: ')}${formatDuration(duration)} | ${message}`, 'error');
			} else {
				logToPanel(`${t('Routing stopped')} - ${t('Duration: ')}${formatDuration(duration)}`);
			}
		})
		.finally(async () => {
			setActiveRouter(null);
			await eda.pcb_Document.startCalculatingRatline();
			await eda.pcb_Layer.setLayerVisible(57 as any);
		});
}

export function stopRoute(): void {
	const router = getActiveRouter();
	if (router && router.isActive()) {
		router.cancel();
		showInfo(t('Stopping routing...'));
	} else {
		showInfo(t('No active routing task'));
	}
}

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
					break;
			}
		},
	);
}

async function handleIFrameStart(): Promise<void> {
	try {
		const dsnFile = await eda.pcb_ManufactureData.getDsnFile('design.dsn');
		if (!dsnFile) {
			eda.sys_MessageBus.publish('freerouting-dsn', { error: t('Failed to get DSN file, please make sure a PCB document is open') });
			showError(t('Failed to get DSN file, please make sure a PCB document is open'));
			return;
		}

		const dsnBase64 = await fileToBase64(dsnFile);
		eda.sys_MessageBus.publish('freerouting-dsn', {
			data: dsnBase64,
			filename: dsnFile.name,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		eda.sys_MessageBus.publish('freerouting-dsn', { error: message });
		showError(`${t('Failed to get DSN file: ')}${message}`);
	}
}

async function collectRouteIds(): Promise<{ lineIds: string[]; arcIds: string[]; viaIds: string[] }> {
	const lineIds = await eda.pcb_PrimitiveLine.getAllPrimitiveId(undefined, undefined, false);
	const arcIds = await eda.pcb_PrimitiveArc.getAllPrimitiveId(undefined, undefined, false);
	const viaIds = await eda.pcb_PrimitiveVia.getAllPrimitiveId(undefined, false);
	return { lineIds, arcIds, viaIds };
}

async function deleteOldPrimitives(snapshot: { lineIds: string[]; arcIds: string[]; viaIds: string[] }): Promise<void> {
	if (snapshot.lineIds.length) await eda.pcb_PrimitiveLine.delete(snapshot.lineIds);
	if (snapshot.arcIds.length) await eda.pcb_PrimitiveArc.delete(snapshot.arcIds);
	if (snapshot.viaIds.length) await eda.pcb_PrimitiveVia.delete(snapshot.viaIds);
}

async function handleIFramePreview(data?: string, filename?: string): Promise<void> {
	if (!data) return;
	try {
		const oldIds = await collectRouteIds();
		const sesFilename = filename || 'routing_result.ses';
		await SESImporter.import(data, sesFilename);
		await deleteOldPrimitives(oldIds);
	} catch (error) {
		console.warn('[FreeRouting] preview import failed:', error);
	}
}

async function handleIFrameComplete(data?: string, filename?: string): Promise<void> {
	if (!data) {
		showError(t('No SES data received'));
		return;
	}

	try {
		const oldIds = await collectRouteIds();
		const sesFilename = filename || 'routing_result.ses';
		const success = await SESImporter.import(data, sesFilename);
		await deleteOldPrimitives(oldIds);

		if (success) {
			showSuccess(t('Auto-routing completed!'));
		} else {
			showError(t('SES file import failed'));
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		showError(`${t('Import failed: ')}${message}`);
	}
}

function cleanupIFrameResources(): void {
	if (iframeMessageTask) {
		iframeMessageTask.cancel();
		iframeMessageTask = null;
	}
}
