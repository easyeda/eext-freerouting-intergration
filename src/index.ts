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
const PROGRESS_IFRAME_ID = 'freerouting-progress';

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

function pushMessageToIFrame(payload: Record<string, unknown>): void {
	try {
		eda.sys_MessageBus.publish('freerouting-log', payload);
	} catch (_) {}
	try {
		eda.sys_MessageBus.publishPublic('freerouting-log-public', payload);
	} catch (_) {}
	appendStorageEvent(payload);
}

const CMD_KEY = '__fr_custom_cmd__';
const EVENTS_KEY = '__fr_custom_events__';

/**
 * 消息总线在浏览器版 EDA 中可能跨上下文不可达，额外把事件写入扩展存储
 * 自定义面板会轮询这个存储作为兜底通道。
 */
function appendStorageEvent(payload: Record<string, unknown>): void {
	try {
		const raw = eda.sys_Storage.getExtensionUserConfig(EVENTS_KEY);
		let events: unknown[] = [];
		try {
			events = raw ? (JSON.parse(raw as string) as unknown[]) : [];
		} catch (_) {
			events = [];
		}
		if (!Array.isArray(events)) events = [];
		events.push(payload);
		if (events.length > 100) events = events.slice(-100);
		void eda.sys_Storage.setExtensionUserConfig(EVENTS_KEY, JSON.stringify(events));
	} catch (_) {}
}

let storagePollTimer: ReturnType<typeof setInterval> | undefined;

function stopStorageCommandPoll(): void {
	if (storagePollTimer) {
		clearInterval(storagePollTimer);
		storagePollTimer = undefined;
	}
}

function startStorageCommandPoll(): void {
	stopStorageCommandPoll();
	let lastCmdId = '';
	storagePollTimer = setInterval(() => {
		try {
			const raw = eda.sys_Storage.getExtensionUserConfig(CMD_KEY);
			if (!raw) return;
			const cmd = JSON.parse(raw as string) as { type?: string; options?: RoutingOptions & { autoDrc?: boolean }; _reqId?: string };
			if (!cmd || !cmd.type || !cmd._reqId || cmd._reqId === lastCmdId) return;
			lastCmdId = cmd._reqId;
			void handleIframeMessage({ type: cmd.type, options: cmd.options, _reqId: cmd._reqId });
		} catch (_) {}
	}, 500);
}

let messageSeq = 0;
function nextMessageId(): string {
	messageSeq++;
	return `${Date.now()}-${messageSeq}-${Math.random().toString(36).slice(2, 8)}`;
}

function pushLogToIFrame(message: string, level = 'info'): void {
	pushMessageToIFrame({ type: 'log', message, level, _id: nextMessageId() });
}

function pushDoneToIFrame(message: string, level = 'success'): void {
	pushMessageToIFrame({ type: 'done', message, level, _id: nextMessageId() });
}

function pushProgressToIFrame(percentage: number, message: string): void {
	pushMessageToIFrame({ type: 'progress', percentage, message, _id: nextMessageId() });
}

function closeProgressIFrame(): void {
	try {
		eda.sys_IFrame.closeIFrame(PROGRESS_IFRAME_ID);
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
	logToPanel(`${t('Routing started')} (v${extensionConfig.version}) - ${new Date(routeStartTime).toLocaleTimeString()}`);

	// EDA 进度条把 title 当作进度条目 key：title 变化会不断新增条目，
	// 显示值变成所有条目的平均值，最终卡在某个百分比。因此整个布线过程必须使用同一个 title。
	const progressTitle = `${t('Auto-routing')} (v${extensionConfig.version})`;
	if (showProgress) {
		// 直接布线也要启用 iframe 命令通道，进度弹窗上的“停止布线”才能生效
		ensureIframeSubscribed();
		// 清空上一轮遗留的命令/事件，避免旧 stop 命令立刻停掉本次布线
		try {
			await eda.sys_Storage.setExtensionUserConfig(CMD_KEY, '');
			await eda.sys_Storage.setExtensionUserConfig(EVENTS_KEY, '[]');
		} catch (_) {}
		startStorageCommandPoll();
		// 使用独立的进度弹窗，避免 EDA 共享进度组被其它导入/任务进度污染
		try {
			await eda.sys_IFrame.openIFrame('./iframe/progress.html', 420, 100, PROGRESS_IFRAME_ID, {
				title: progressTitle,
				buttonCallbackFn: (button: string) => {
					if (button === 'close') stopRoute();
				},
			} as any);
		} catch (_) {}
		pushProgressToIFrame(0, progressTitle);
	}

	const router = new FreeRoutingRouter(
		(progress) => {
			if (showProgress) pushProgressToIFrame(progress.percentage, progress.message);
		},
		(message, level) => {
			console.log(`[FreeRouting] [${level}] ${message}`);
			logFn?.(message, level);
			// 直接布线没有面板日志，同步写一份到 EDA 日志，便于排查进度停住的位置
			if (!logFn) {
				logToPanel(message, level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info');
			}
		},
	);

	setRouter(router);

	router
		.route(options)
		.then((result: RouteResult) => {
			const duration = Date.now() - routeStartTime;
			if (showProgress) {
				eda.sys_LoadingAndProgressBar.destroyProgressBar();
				pushProgressToIFrame(result.success ? 100 : 96, result.success ? t('SES file imported') : t('Routing finished'));
				setTimeout(closeProgressIFrame, 800);
				stopStorageCommandPoll();
			}
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
			if (showProgress) {
				eda.sys_LoadingAndProgressBar.destroyProgressBar();
				closeProgressIFrame();
				stopStorageCommandPoll();
			}
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
	closeProgressIFrame();
	try {
		void eda.pcb_Document.startCalculatingRatline().catch(() => {});
		void eda.pcb_Layer.setLayerVisible(57 as any).catch(() => {});
	} catch (_) {}
}

export async function autoRouteCustom(): Promise<void> {
	ensureIframeSubscribed();
	logToPanel(`Custom Auto Route panel opened (v${extensionConfig.version})`);

	// 清掉上一次面板遗留的存储命令/事件，并启动存储兜底通道
	try {
		await eda.sys_Storage.setExtensionUserConfig(CMD_KEY, '');
		await eda.sys_Storage.setExtensionUserConfig(EVENTS_KEY, '[]');
	} catch (_) {}
	startStorageCommandPoll();

	await eda.sys_IFrame.openIFrame('./iframe/routing.html', 800, 600, IFRAME_ID, {
		maximizeButton: true,
		minimizeButton: true,
		title: t('Custom Auto Route'),
		buttonCallbackFn: (button: string) => {
			if (button === 'close') {
				stopStorageCommandPoll();
				stopRoute();
			}
		},
	} as any);
}

interface CustomIframeMessage {
	type: string;
	options?: RoutingOptions & { autoDrc?: boolean };
	_reqId?: string;
}

async function handleIframeMessage(message: CustomIframeMessage): Promise<void> {
	// 私有/公共总线可能各投递一次，按请求 ID 去重
	if (message._reqId) {
		if (G.__fr_last_req_id__ === message._reqId) return;
		G.__fr_last_req_id__ = message._reqId;
	}

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
		case 'ping':
			pushMessageToIFrame({ type: 'pong', _id: nextMessageId() });
			break;
	}
}

function ensureIframeSubscribed(): void {
	if (G[SUB_KEY]) return;

	let bound = false;
	try {
		eda.sys_MessageBus.subscribe('freerouting-iframe', handleIframeMessage);
		bound = true;
	} catch (error) {
		console.error('[FreeRouting] failed to subscribe private iframe messages:', error);
	}
	try {
		eda.sys_MessageBus.subscribePublic('freerouting-iframe-public', handleIframeMessage);
		bound = true;
	} catch (error) {
		console.error('[FreeRouting] failed to subscribe public iframe messages:', error);
	}
	// 任一总线订阅成功即可，避免重复注册
	if (bound) G[SUB_KEY] = true;
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
