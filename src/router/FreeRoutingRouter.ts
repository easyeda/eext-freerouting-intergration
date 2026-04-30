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

		try {
			this.checkCancelled();

			this.onLog?.(t('Getting DSN file...'), 'info');
			const dsnFile = await eda.pcb_ManufactureData.getDsnFile('design.dsn');
			if (!dsnFile) {
				throw new Error(t('Failed to get DSN file, please make sure a PCB document is open'));
			}
			const dsnFilename = dsnFile.name;
			this.onLog?.(`${t('DSN file obtained: ')}${dsnFilename}`, 'success');

			this.checkCancelled();

			this.onLog?.(t('Encoding DSN file...'), 'info');
			const dsnBase64 = await fileToBase64(dsnFile);

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

				const jobStatus = await FreeRoutingAPI.getJobStatus(job.id);
				const stats = jobStatus.output?.statistics;
				if (stats) {
					this.onLog?.(`${t('Stats: nets ')}${stats.nets?.total_count ?? 0}${t(' routed | vias ')}${stats.vias?.total_count ?? 0}${t(' traces ')}${stats.traces?.total_count ?? 0}`, 'info');
				}

				const output = await FreeRoutingAPI.getJobOutput(job.id);

				this.onLog?.(t('Importing final results...'), 'info');
				await eda.pcb_Document.startCalculatingRatline();
				await deletePrimitives(await collectRouteIds());
				const filename = output.filename || 'routing_result.ses';
				const success = await SESImporter.import(output.data, filename);
				if (success) {
					this.onLog?.(t('SES file imported'), 'success');
					if (!options.skipDrc) {
						this.onLog?.(t('Running DRC check...'), 'info');
						await eda.pcb_Drc.check(true, true, false);
						this.onLog?.(t('DRC check complete'), 'success');
					}
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

	private pollProgress(jobId: string, dsnFilename: string, maxPasses: number): Promise<JobState> {
		return new Promise((resolve) => {
			this.pollResolve = resolve;
			const TERMINAL_STATES: JobState[] = ['COMPLETED', 'FAILED', 'CANCELLED', 'TIMED_OUT'];
			let lastStage = '';
			let lastPass = 0;
			let lastPreviewTime = 0;

			const poll = async () => {
				if (this.cancelled) {
					resolve('CANCELLED');
					return;
				}

				try {
					const status = await FreeRoutingAPI.getJobStatus(jobId);

					if (this.cancelled) {
						resolve('CANCELLED');
						return;
					}

					if (TERMINAL_STATES.includes(status.state)) {
						this.onProgress?.({ stage: '', percentage: 100, message: '' });
						resolve(status.state);
						return;
					}

					const currentStage = `${status.stage || ''}_${status.state}`;
					const currentPass = status.current_pass || 0;
					const cappedPass = Math.min(currentPass, maxPasses - 1);
					const percentage = maxPasses > 1 ? Math.round((cappedPass / maxPasses) * 100) : 0;

					const stageMap: Record<string, string> = {
						'IDLE': t('Idle'),
						'FANOUT': t('Fanout'),
						'ROUTING': t('Routing'),
						'OPTIMIZING': t('Optimizing'),
						'POSTPROCESSING': t('Postprocessing'),
					};
					const stageText = stageMap[status.stage || ''] || status.stage || status.state;
					const passText = t('Routing: Pass ');

					if (currentStage !== lastStage || (currentPass > 0 && currentPass !== lastPass)) {
						lastStage = currentStage;
						lastPass = currentPass;
						this.onProgress?.({
							stage: stageText,
							percentage,
							message: `${stageText}: ${passText}${currentPass} / ${maxPasses} (${percentage}%)`,
						});
					}

					const outputStats = status.output?.statistics;
					const inputStats = status.input?.statistics;
					const totalNets = inputStats?.nets?.total_count ?? 0;
					const routedNets = outputStats?.nets?.total_count ?? 0;
					const viaCount = outputStats?.vias?.total_count ?? 0;

					const now = Date.now();
					if ((now - lastPreviewTime) >= PREVIEW_INTERVAL && status.state === 'RUNNING') {
						lastPreviewTime = now;
						try {
							const partial = await FreeRoutingAPI.getJobOutputPartial(jobId);
							if (this.cancelled) {
								resolve('CANCELLED');
								return;
							}
							if (partial && partial.data) {
								this.onLog?.(t('Updating preview...'), 'info');
								await deletePrimitives(await collectRouteIds());
								const filename = partial.filename || dsnFilename.replace(/\.dsn$/i, '.ses');
								await SESImporter.import(partial.data, filename);
							}
						} catch (previewErr) {
							console.warn('[FreeRouting] preview failed:', previewErr);
						}
						this.onLog?.(`${t('[Preview] routed: ')}${routedNets}/${totalNets}${t(' | vias: ')}${viaCount}`, 'info');
					}
				} catch (error) {
					if (this.cancelled) {
						resolve('CANCELLED');
						return;
					}
					console.error('[FreeRouting] poll error:', error);
				}

				if (!this.cancelled) {
					this.pollTimeout = setTimeout(poll, POLL_INTERVAL);
				} else {
					resolve('CANCELLED');
				}
			};

			this.pollTimeout = setTimeout(poll, POLL_INTERVAL);
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
