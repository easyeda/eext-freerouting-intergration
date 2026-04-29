/**
 * 入口文件
 */
import * as extensionConfig from '../extension.json';
import { FreeRoutingRouter, RouteResult } from './router/FreeRoutingRouter';
import { QUICK_ROUTE_OPTIONS, RoutingOptions } from './types';
import { showInfo, showSuccess, showError, t } from './utils/toast';

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

function pushLogToIFrame(message: string, level = 'info'): void {
	try {
		eda.sys_MessageBus.publish('freerouting-log', { type: 'log', message, level });
	} catch (_) {}
}

function pushDoneToIFrame(message: string, level = 'success'): void {
	try {
		eda.sys_MessageBus.publish('freerouting-log', { type: 'done', message, level });
	} catch (_) {}
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

async function runRoute(options: RoutingOptions, logFn?: (msg: string, level: string) => void, showProgress = true): Promise<void> {
	if (getActiveRouter()?.isActive()) {
		showError(t('Routing in progress, please stop current routing first'));
		return;
	}

	await eda.pcb_Document.stopCalculatingRatline();
	await eda.pcb_Layer.setLayerInvisible(57 as any);

	routeStartTime = Date.now();
	logToPanel(`${t('Routing started')} - ${new Date(routeStartTime).toLocaleTimeString()}`);

	if (showProgress) eda.sys_LoadingAndProgressBar.showProgressBar(0, t('Starting auto-routing...'));

	const router = new FreeRoutingRouter(
		(progress) => {
			if (showProgress) eda.sys_LoadingAndProgressBar.showProgressBar(progress.percentage, progress.message);
			logFn?.(progress.message, 'info');
		},
		(message, level) => {
			console.log(`[FreeRouting] [${level}] ${message}`);
			logFn?.(message, level);
		},
	);

	setActiveRouter(router);

	router
		.route(options)
		.then((result: RouteResult) => {
			const duration = Date.now() - routeStartTime;
			if (showProgress) eda.sys_LoadingAndProgressBar.destroyProgressBar();
			if (result.success) {
				showSuccess(t('Auto-routing completed!'));
				logToPanel(`${t('Routing completed')} - ${new Date().toLocaleTimeString()} | ${t('Duration: ')}${formatDuration(duration)}`);
				const doneMsg = `${t('Routing completed')} | ${t('Duration: ')}${formatDuration(duration)}`;
				if (result.statistics) {
					const s = result.statistics;
					const statsMsg = `${t('Result: routed nets ')}${s.routed_net_count ?? s.nets?.total_count ?? 0}${t(' vias ')}${s.via_count ?? s.vias?.total_count ?? 0}${t(' traces ')}${s.traces?.total_count ?? 0}`;
					logToPanel(statsMsg);
					logFn?.(statsMsg, 'info');
				}
				pushDoneToIFrame(doneMsg);
			} else {
				showInfo(t('Routing finished'));
				logToPanel(`${t('Routing ended - incomplete')} - ${new Date().toLocaleTimeString()} | ${t('Duration: ')}${formatDuration(duration)}`);
				pushDoneToIFrame(`${t('Routing ended - incomplete')} | ${t('Duration: ')}${formatDuration(duration)}`, 'warn');
			}
		})
		.catch((error: Error) => {
			const duration = Date.now() - routeStartTime;
			if (showProgress) eda.sys_LoadingAndProgressBar.destroyProgressBar();
			const message = error.message || String(error);
			if (message !== '布线已取消') {
				showError(`${t('Routing failed: ')}${message}`);
				logToPanel(`${t('Routing failed')} - ${t('Duration: ')}${formatDuration(duration)} | ${message}`, 'error');
				pushDoneToIFrame(`${t('Routing failed')}: ${message}`, 'error');
			} else {
				logToPanel(`${t('Routing stopped')} - ${t('Duration: ')}${formatDuration(duration)}`);
				pushDoneToIFrame(`${t('Routing stopped')} | ${t('Duration: ')}${formatDuration(duration)}`, 'warn');
			}
		})
		.finally(async () => {
			setActiveRouter(null);
			await eda.pcb_Document.startCalculatingRatline();
			await eda.pcb_Layer.setLayerVisible(57 as any);
		});
}

export async function autoRoute(): Promise<void> {
	await runRoute(QUICK_ROUTE_OPTIONS);
}

export function stopRoute(): void {
	const router = getActiveRouter();
	if (router && router.isActive()) {
		router.cancel();
		eda.sys_LoadingAndProgressBar.destroyProgressBar();
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
			title: t('Custom Auto Route'),
			buttonCallbackFn: (button: string) => {
				if (button === 'close') {
					cleanupIFrameResources();
				}
			},
		} as any,
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
		async (message: { type: string; options?: RoutingOptions & { autoDrc?: boolean } }) => {
			switch (message.type) {
				case 'start-custom':
					if (message.options) {
						const opts: RoutingOptions = {
							maxPasses: message.options.maxPasses,
							enableJlcPostprocess: message.options.enableJlcPostprocess ?? true,
							routerSettings: message.options.routerSettings,
						};
						const autoDrc = message.options.autoDrc !== false;
						if (!autoDrc) {
							opts.skipDrc = true;
						}
						await runRoute(opts, pushLogToIFrame, false);
					}
					break;
				case 'stop':
					stopRoute();
					break;
			}
		},
	);
}

function cleanupIFrameResources(): void {
	if (iframeMessageTask) {
		iframeMessageTask.cancel();
		iframeMessageTask = null;
	}
}
