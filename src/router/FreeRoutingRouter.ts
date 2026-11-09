/**
 * FreeRouting 路由器
 * 核心布线控制器，协调 DSN 获取、REST API 通信和 SES 导入
 */
import { FreeRoutingAPI } from '../api/FreeRoutingAPI';
import { SESImporter } from '../importer/SESImporter';
import { JobState, POLL_INTERVAL, PREVIEW_INTERVAL, RoutingOptions, RoutingProgress, RoutingStatistics } from '../types';
import { fileToBase64 } from '../utils/base64';
import { t } from '../utils/toast';

export type ProgressCallback = (progress: RoutingProgress) => void;
export type LogCallback = (message: string, level: string) => void;

/** 查询任务状态的最长等待时间 (毫秒) */
const STATUS_TIMEOUT = 10000;
/** 本地请求/文件处理的最长等待时间 (毫秒) */
const REQUEST_TIMEOUT = 60000;
/** 获取最终结果的最长等待时间 (毫秒) */
const RESULT_TIMEOUT = 30000;
/** 导入 SES / 执行 DRC 的最长等待时间 (毫秒) */
const IMPORT_TIMEOUT = 120000;
/** 拉取任务日志的间隔 (毫秒) */
const LOGS_INTERVAL = 10000;
/** 拉取任务日志的超时时间 (毫秒) */
const LOGS_TIMEOUT = 5000;

function withTimeout<T>(promise: Promise<T>, timeout: number, message: string): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(message)), timeout);
		promise.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(error) => {
				clearTimeout(timer);
				reject(error);
			},
		);
	});
}

export interface RouteResult {
	success: boolean;
	statistics?: RoutingStatistics;
}

interface PrimitiveSnapshot {
	lineIds: string[];
	arcIds: string[];
	viaIds: string[];
}

async function collectRouteIds(): Promise<PrimitiveSnapshot> {
	const lineIds = await eda.pcb_PrimitiveLine.getAllPrimitiveId(undefined, undefined, false);
	const arcIds = await eda.pcb_PrimitiveArc.getAllPrimitiveId(undefined, undefined, false);
	const viaIds = await eda.pcb_PrimitiveVia.getAllPrimitiveId(undefined, false);
	return { lineIds, arcIds, viaIds };
}

async function deletePrimitives(snapshot: PrimitiveSnapshot): Promise<void> {
	if (snapshot.lineIds.length) await eda.pcb_PrimitiveLine.delete(snapshot.lineIds);
	if (snapshot.arcIds.length) await eda.pcb_PrimitiveArc.delete(snapshot.arcIds);
	if (snapshot.viaIds.length) await eda.pcb_PrimitiveVia.delete(snapshot.viaIds);
}

export class FreeRoutingRouter {
	private onProgress?: ProgressCallback;
	private onLog?: LogCallback;
	private isRouting = false;
	private cancelled = false;
	private currentJobId?: string;
	private pollTimeout?: ReturnType<typeof setTimeout>;
	private pollResolve?: (state: JobState) => void;
	/** 当前已显示的进度百分比，保证只增不减 */
	private lastPercentage = 0;

	constructor(onProgress?: ProgressCallback, onLog?: LogCallback) {
		this.onProgress = onProgress;
		this.onLog = onLog;
	}

	async route(options: RoutingOptions): Promise<RouteResult> {
		if (this.isRouting) {
			throw new Error('布线正在进行中');
		}

		this.isRouting = true;
		this.cancelled = false;
		this.lastPercentage = 0;

		try {
			this.checkCancelled();

			this.onLog?.(t('Getting DSN file...'), 'info');
			const dsnFile = await withTimeout(
				eda.pcb_ManufactureData.getDsnFile('design.dsn'),
				REQUEST_TIMEOUT,
				t('Timed out while getting DSN file'),
			);
			if (!dsnFile) {
				throw new Error(t('Failed to get DSN file, please make sure a PCB document is open'));
			}
			const dsnFilename = dsnFile.name;
			this.onLog?.(`${t('DSN file obtained: ')}${dsnFilename}`, 'success');

			this.checkCancelled();

			this.onLog?.(t('Encoding DSN file...'), 'info');
			const dsnBase64 = await withTimeout(fileToBase64(dsnFile), REQUEST_TIMEOUT, t('Timed out while encoding DSN file'));

			this.checkCancelled();

			this.onLog?.(t('Creating routing session...'), 'info');
			const session = await FreeRoutingAPI.createSession();
			this.onLog?.(`${t('Session created: ')}${session.id}`, 'info');

			this.checkCancelled();

			const jobName = dsnFilename.replace(/\.dsn$/i, '');
			const job = await FreeRoutingAPI.enqueueJob(session.id, jobName);
			this.currentJobId = job.id;
			this.onLog?.(`${t('Job created: ')}${job.id}`, 'info');

			this.checkCancelled();

			const settings: Record<string, unknown> = { max_passes: options.maxPasses };
			if (options.routerSettings) {
				Object.assign(settings, options.routerSettings);
			}
			await FreeRoutingAPI.updateSettings(job.id, settings as any);
			this.onLog?.(`${t('Max passes: ')}${options.maxPasses}`, 'info');

			this.checkCancelled();

			this.onLog?.(t('Uploading DSN file...'), 'info');
			await FreeRoutingAPI.submitInput(job.id, dsnFilename, dsnBase64);
			this.onLog?.(t('DSN file uploaded'), 'success');

			this.checkCancelled();

			this.onLog?.(t('Starting routing...'), 'info');
			await FreeRoutingAPI.startJob(job.id);
			this.onLog?.(t('Routing started!'), 'success');

			const finalState = await this.pollProgress(job.id, dsnFilename, options.maxPasses);

			if (finalState === 'COMPLETED') {
				this.onLog?.(t('Routing complete, fetching results...'), 'success');

				const jobStatus = await withTimeout(
					FreeRoutingAPI.getJobStatus(job.id),
					RESULT_TIMEOUT,
					t('Timed out while fetching routing results'),
				);
				const stats = jobStatus.output?.statistics;
				const liveStats = jobStatus.statistics;
				const nets = stats?.nets?.totalCount ?? stats?.nets?.total_count ?? liveStats?.total_nets ?? 0;
				const vias = stats?.vias?.totalCount ?? stats?.vias?.total_count ?? 0;
				const traces = stats?.traces?.totalCount ?? stats?.traces?.total_count ?? 0;
				this.onLog?.(`${t('Stats: nets ')}${nets}${t(' routed | vias ')}${vias}${t(' traces ')}${traces}`, 'info');

				const output = await withTimeout(FreeRoutingAPI.getJobOutput(job.id), RESULT_TIMEOUT, t('Timed out while fetching routing results'));

				this.onLog?.(t('Importing final results...'), 'info');
				this.onProgress?.({ stage: '', percentage: 97, message: t('Importing final results...') });
				await eda.pcb_Document.startCalculatingRatline();
				await deletePrimitives(await collectRouteIds());
				const filename = output.filename || 'routing_result.ses';
				const success = await withTimeout(
					SESImporter.import(output.data, filename),
					IMPORT_TIMEOUT,
					t('Timed out while importing routing results'),
				);
				if (success) {
					this.onLog?.(t('SES file imported'), 'success');
					if (!options.skipDrc) {
						this.onLog?.(t('Running DRC check...'), 'info');
						this.onProgress?.({ stage: '', percentage: 99, message: t('Running DRC check...') });
						await withTimeout(eda.pcb_Drc.check(true, true, false), IMPORT_TIMEOUT, t('Timed out while running DRC'));
						this.onLog?.(t('DRC check complete'), 'success');
					}
					this.onProgress?.({ stage: '', percentage: 100, message: t('SES file imported') });
					return { success: true, statistics: stats };
				} else {
					this.onLog?.(t('SES import failed'), 'error');
					return { success: false };
				}
			} else if (this.cancelled) {
				this.onLog?.(t('Routing stopped, keeping current results'), 'warn');
				return { success: false };
			} else {
				this.onLog?.(`${t('Routing incomplete, state: ')}${finalState}`, 'error');
				return { success: false };
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (message !== '布线已取消') {
				this.onLog?.(`${t('Error: ')}${message}`, 'error');
			}
			throw error;
		} finally {
			this.cleanup();
		}
	}

	private checkCancelled(): void {
		if (this.cancelled) throw new Error('布线已取消');
	}

	private pollProgress(jobId: string, dsnFilename: string, maxPasses: number, totalConnections = 0): Promise<JobState> {
		return new Promise((resolve) => {
			this.pollResolve = resolve;
			const TERMINAL_STATES: JobState[] = ['COMPLETED', 'FAILED', 'CANCELLED', 'TIMED_OUT', 'TERMINATED'];
			let lastStage = '';
			let lastPass = 0;
			let lastUnrouted: number | null = null;
			let lastMessage = '';
			let lastPreviewTime = 0;
			let total = totalConnections > 0 ? totalConnections : 0;
			let nextDelay = POLL_INTERVAL;
			let lastLogsTime = 0;
			let logBaseline = 0;
			let logUnrouted: number | null = null;
			const progressStartedAt = Date.now();

			// eslint-disable-next-line complexity
			const poll = async () => {
				if (this.cancelled) {
					resolve('CANCELLED');
					return;
				}

				try {
					const status = await withTimeout(
						FreeRoutingAPI.getJobStatus(jobId),
						STATUS_TIMEOUT,
						t('Timed out while fetching routing status'),
					);

					if (this.cancelled) {
						resolve('CANCELLED');
						return;
					}

					if (TERMINAL_STATES.includes(status.state)) {
						if (status.state === 'COMPLETED') {
							this.lastPercentage = Math.min(99, Math.max(this.lastPercentage, 95));
							this.onProgress?.({
								stage: '',
								percentage: Math.round(this.lastPercentage),
								message: t('Routing complete, fetching results...'),
							});
						}
						resolve(status.state);
						return;
					}

					const stageKey = (status.stage || '').toUpperCase();
					const currentStage = `${stageKey}_${status.state}`;
					const currentPass = status.current_pass || 0;
					const now = Date.now();

					// 从任务日志中解析真实未布通数量
					if (now - lastLogsTime >= LOGS_INTERVAL) {
						lastLogsTime = now;
						try {
							const entries = await withTimeout(FreeRoutingAPI.getJobLogs(jobId), LOGS_TIMEOUT, 'logs timeout');
							const messages = (entries || []).map((entry) => entry.message || '').filter(Boolean);
							if (logBaseline <= 0) {
								for (const msg of messages) {
									const baselineMatch = msg.match(/Auto-routing stage started[\s\S]*?for (\d+) unrouted items/i);
									if (baselineMatch) {
										logBaseline = parseInt(baselineMatch[1], 10);
										break;
									}
								}
							}
							for (let i = messages.length - 1; i >= 0; i--) {
								const passMatch = messages[i].match(/Auto-routing pass #\d+[\s\S]*?\((\d+) unrouted/i);
								if (passMatch) {
									logUnrouted = parseInt(passMatch[1], 10);
									break;
								}
							}
						} catch (logError) {
							console.warn('[FreeRouting] failed to read job logs:', logError);
						}
					}

					const incomplete =
						status.statistics?.unrouted_connections ??
						status.input?.statistics?.connections?.incompleteCount ??
						status.input?.statistics?.connections?.incomplete_count ??
						null;

					if (total <= 0 && incomplete != null && incomplete > 0) total = incomplete;

					let effectiveTotal = total;
					let effectiveIncomplete = incomplete;
					if ((effectiveIncomplete == null || effectiveTotal <= 0) && logBaseline > 0) {
						effectiveTotal = logBaseline;
						effectiveIncomplete = logUnrouted ?? logBaseline;
					}

					if (effectiveTotal <= 0 && effectiveIncomplete != null && effectiveIncomplete > 0) effectiveTotal = effectiveIncomplete;
					nextDelay = POLL_INTERVAL;

					const stageMap: Record<string, string> = {
						'IDLE': t('Idle'),
						'FANOUT': t('Fanout'),
						'ROUTING': t('Routing'),
						'OPTIMIZATION': t('Optimizing'),
						'OPTIMIZING': t('Optimizing'),
						'POSTPROCESSING': t('Postprocessing'),
					};
					const stageText = stageMap[stageKey] || status.stage || status.state;
					const passText = t('Routing: Pass ');
					const unroutedText =
						effectiveIncomplete != null && effectiveTotal > 0
							? `${t(' | unrouted ')}${effectiveIncomplete}${t(' / ')}${effectiveTotal}`
							: '';

					let ceiling = 90;
					let realTarget: number | null = null;
					const statsReady = effectiveTotal > 0 && effectiveIncomplete != null;
					if (stageKey === 'ROUTING' || stageKey === 'FANOUT') {
						ceiling = 90;
						if (statsReady) {
							const routedFraction = Math.min(1, Math.max(0, (effectiveTotal - (effectiveIncomplete as number)) / effectiveTotal));
							realTarget = 5 + routedFraction * 85;
						}
					} else if (stageKey === 'OPTIMIZATION' || stageKey === 'OPTIMIZING' || stageKey === 'POSTPROCESSING') {
						ceiling = 96;
						if (statsReady && effectiveIncomplete === 0) realTarget = 90;
					}

					// 优先使用日志里的真实未布通比例；仅在没有数据时用时间兜底，避免一直停在 0%
					const elapsedMinutes = (now - progressStartedAt) / 60000;
					const timeTarget = Math.min(ceiling, elapsedMinutes * 2);
					const target = realTarget ?? timeTarget;
					this.lastPercentage = Math.min(ceiling, Math.max(this.lastPercentage, target));

					const percentage = Math.min(99, Math.round(this.lastPercentage));
					const message = `${stageText}: ${passText}${currentPass}${t(' / ')}${maxPasses}${unroutedText} (${percentage}%)`;
					const changed = currentStage !== lastStage || currentPass !== lastPass || effectiveIncomplete !== lastUnrouted;
					if (changed || message !== lastMessage) {
						this.onLog?.(message, 'info');
						this.onProgress?.({ stage: stageText, percentage, message });
						lastStage = currentStage;
						lastPass = currentPass;
						lastUnrouted = effectiveIncomplete;
						lastMessage = message;
					}

					// 每 10 秒把当前布线结果写入画布（过程预览）
					if (now - lastPreviewTime >= PREVIEW_INTERVAL && status.state === 'RUNNING') {
						lastPreviewTime = now;
						try {
							const partial = await withTimeout(FreeRoutingAPI.getJobOutputPartial(jobId), STATUS_TIMEOUT, 'preview timeout');
							if (this.cancelled) {
								resolve('CANCELLED');
								return;
							}
							if (partial && partial.data) {
								this.onLog?.(t('Updating preview...'), 'info');
								await deletePrimitives(await collectRouteIds());
								const filename = partial.filename || dsnFilename.replace(/\.dsn$/i, '.ses');
								await SESImporter.import(partial.data, filename);
								// 预览导入会触发 EDA 自己的导入进度条，结束后清掉，避免残留 67%
								try {
									eda.sys_LoadingAndProgressBar.destroyProgressBar();
								} catch (_) {}
							}
						} catch (previewErr) {
							console.warn('[FreeRouting] preview failed:', previewErr);
						}
						if (effectiveTotal > 0 && effectiveIncomplete != null) {
							const routed = Math.max(0, effectiveTotal - effectiveIncomplete);
							this.onLog?.(`${t('[Preview] routed: ')}${routed}/${effectiveTotal}${t(' | unrouted: ')}${effectiveIncomplete}`, 'info');
						}
					}
				} catch (error) {
					if (this.cancelled) {
						resolve('CANCELLED');
						return;
					}
					console.error('[FreeRouting] poll error:', error);
				}

				if (!this.cancelled) {
					this.pollTimeout = setTimeout(poll, nextDelay);
				} else {
					resolve('CANCELLED');
				}
			};

			// 立即做首次采样，尽早拿到基准连接数
			this.pollTimeout = setTimeout(poll, 300);
		});
	}

	cancel(): void {
		if (!this.isRouting || this.cancelled) return;
		this.cancelled = true;
		this.isRouting = false;
		if (this.pollTimeout) {
			clearTimeout(this.pollTimeout);
			this.pollTimeout = undefined;
		}
		if (this.pollResolve) {
			this.pollResolve('CANCELLED');
			this.pollResolve = undefined;
		}
		if (this.currentJobId) {
			FreeRoutingAPI.cancelJob(this.currentJobId).catch(() => {});
		}
	}

	private cleanup(): void {
		this.isRouting = false;
		this.cancelled = false;
		this.currentJobId = undefined;
		this.pollResolve = undefined;
		if (this.pollTimeout) {
			clearTimeout(this.pollTimeout);
			this.pollTimeout = undefined;
		}
	}

	isActive(): boolean {
		return this.isRouting;
	}
}
