/**
 * 入口文件
 */
import * as extensionConfig from '../extension.json';
import { FreeRoutingAPI } from './api/FreeRoutingAPI';
import { FreeRoutingRouter, RouteResult } from './router/FreeRoutingRouter';
import { QUICK_ROUTE_OPTIONS, RoutingOptions } from './types';
import { showError, showInfo, showSuccess, showWarning, t } from './utils/toast';

const IFRAME_ID = 'freerouting-config';
const SERVICE_DIALOG_ID = 'freerouting-service-dialog';

const G = globalThis as any;
const ROUTER_KEY = '__fr_router__';
const LOCK_KEY = '__fr_lock__';
const SUB_KEY = '__fr_subscribed__';
const SVC_SUB_KEY = '__fr_svc_subscribed__';

function getRouter(): FreeRoutingRouter | null {
	return G[ROUTER_KEY] || null;
}
function setRouter(r: FreeRoutingRouter | null): void {
	G[ROUTER_KEY] = r;
}
function tryLock(): boolean {
	if (G[LOCK_KEY]) {
		const router = getRouter();
		// 路由器已不存在或已结束，视为上一次布线遗留的锁，直接回收
		if (router && router.isActive()) return false;
		unlock();
	}
	G[LOCK_KEY] = true;
	return true;
}
function unlock(): void {
	G[LOCK_KEY] = false;
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
	if (!tryLock()) {
		const message = t('Routing in progress, please stop current routing first');
		showWarning(message, 5);
		logToPanel(message, 'warn');
		logFn?.(message, 'warn');
		return;
	}

	logFn?.(t('Checking FreeRouting service...'), 'info');
	// 服务检测最长等待 10 秒，避免请求挂起时界面无任何反馈
	const serviceStatus = await Promise.race([
		FreeRoutingAPI.checkService(),
		new Promise<'unavailable'>((resolve) => setTimeout(() => resolve('unavailable'), 10000)),
	]);
	if (serviceStatus === 'permission-denied') {
		unlock();
		const message = t(
			'External interaction permission is not enabled. Please go to: Advanced -> Extension Manager -> FreeRouting -> Settings, enable "Allow External Interaction" and retry',
		);
		showWarning(message, 10);
		logToPanel(message, 'error');
		logFn?.(message, 'error');
		return;
	}
	if (serviceStatus !== 'ok') {
		unlock();
		const message = t('FreeRouting service not running');
		logToPanel(message, 'warn');
		logFn?.(message, 'warn');
		showServiceNotFoundDialog(options, logFn, showProgress);
		return;
	}
	logFn?.(t('FreeRouting service detected'), 'success');

	try {
		await eda.pcb_Document.stopCalculatingRatline();
		await eda.pcb_Layer.setLayerInvisible(57 as any);
	} catch (error) {
		unlock();
		const message = `${t('Error: ')}${error instanceof Error ? error.message : String(error)}`;
		showError(message);
		logToPanel(message, 'error');
		logFn?.(message, 'error');
		return;
	}

	routeStartTime = Date.now();
	logToPanel(`${t('Routing started')} - ${new Date(routeStartTime).toLocaleTimeString()}`);

	if (showProgress) eda.sys_LoadingAndProgressBar.showProgressBar(0, t('Starting auto-routing...'));

	const router = new FreeRoutingRouter(
		(progress) => {
			if (showProgress) eda.sys_LoadingAndProgressBar.showProgressBar(progress.percentage, progress.message);
		},
		(message, level) => {
			console.log(`[FreeRouting] [${level}] ${message}`);
			logFn?.(message, level);
		},
	);

	setRouter(router);

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
					const nets = s.nets?.totalCount ?? s.nets?.total_count ?? 0;
					const vias = s.vias?.totalCount ?? s.vias?.total_count ?? 0;
					const traces = s.traces?.totalCount ?? s.traces?.total_count ?? 0;
					const statsMsg = `${t('Result: routed nets ')}${nets}${t(' vias ')}${vias}${t(' traces ')}${traces}`;
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
			setRouter(null);
			unlock();
			await eda.pcb_Document.startCalculatingRatline();
			await eda.pcb_Layer.setLayerVisible(57 as any);
		});
}

export async function autoRoute(): Promise<void> {
	await runRoute(QUICK_ROUTE_OPTIONS);
}

export function stopRoute(): void {
	const router = getRouter();
	if (router && router.isActive()) {
		router.cancel();
	}
	// 无论是否还有活动路由都释放锁，避免上一次异常中断后无法再次启动
	setRouter(null);
	unlock();
	eda.sys_LoadingAndProgressBar.destroyProgressBar();
	try {
		void eda.pcb_Document.startCalculatingRatline().catch(() => {});
		void eda.pcb_Layer.setLayerVisible(57 as any).catch(() => {});
	} catch (_) {}
}

export async function autoRouteCustom(): Promise<void> {
	ensureIframeSubscribed();

	await eda.sys_IFrame.openIFrame('./iframe/routing.html', 800, 600, IFRAME_ID, {
		maximizeButton: true,
		minimizeButton: true,
		title: t('Custom Auto Route'),
		buttonCallbackFn: (button: string) => {
			if (button === 'close') {
				stopRoute();
			}
		},
	} as any);
}

function ensureIframeSubscribed(): void {
	if (G[SUB_KEY]) return;

	try {
		eda.sys_MessageBus.subscribe('freerouting-iframe', async (message: { type: string; options?: RoutingOptions & { autoDrc?: boolean } }) => {
			switch (message.type) {
				case 'start-custom':
					if (message.options) {
						logToPanel(t('Starting auto-routing...'));
						pushLogToIFrame(t('Starting auto-routing...'), 'info');
						const opts: RoutingOptions = {
							maxPasses: message.options.maxPasses,
							enableJlcPostprocess: message.options.enableJlcPostprocess ?? true,
							routerSettings: message.options.routerSettings,
						};
						const autoDrc = message.options.autoDrc !== false;
						if (!autoDrc) {
							opts.skipDrc = true;
						}
						try {
							await runRoute(opts, pushLogToIFrame, false);
						} catch (error) {
							unlock();
							const msg = `${t('Error: ')}${error instanceof Error ? error.message : String(error)}`;
							showError(msg);
							logToPanel(msg, 'error');
							pushLogToIFrame(msg, 'error');
						}
					}
					break;
				case 'stop':
					stopRoute();
					break;
			}
		});
		G[SUB_KEY] = true;
	} catch (error) {
		// 订阅失败时不置位，下次打开面板会重试
		console.error('[FreeRouting] failed to subscribe custom iframe messages:', error);
	}
}

function showServiceNotFoundDialog(
	pendingOptions?: RoutingOptions,
	pendingLogFn?: (msg: string, level: string) => void,
	pendingShowProgress?: boolean,
): void {
	if (!G[SVC_SUB_KEY]) {
		G[SVC_SUB_KEY] = true;
		eda.sys_MessageBus.subscribe('freerouting-service-dialog', async (message: { type: string }) => {
			if (message.type === 'retry') {
				eda.sys_IFrame.closeIFrame(SERVICE_DIALOG_ID);
				const opts = G.__fr_pending_opts__;
				const logFn = G.__fr_pending_logfn__;
				const showProg = G.__fr_pending_showprog__;
				if (opts) {
					await runRoute(opts, logFn, showProg);
				}
			}
		});
	}

	G.__fr_pending_opts__ = pendingOptions;
	G.__fr_pending_logfn__ = pendingLogFn;
	G.__fr_pending_showprog__ = pendingShowProgress;

	eda.sys_IFrame.openIFrame('./iframe/service-not-found.html', 450, 520, SERVICE_DIALOG_ID, {
		title: t('FreeRouting Service Not Running'),
	} as any);
}
