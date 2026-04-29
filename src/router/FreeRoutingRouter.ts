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
	private pollTimer?: ReturnType<typeof setInterval>;
	private cancelled = false;

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
			this.onLog?.(t('Getting DSN file...'), 'info');
			const dsnFile = await eda.pcb_ManufactureData.getDsnFile('design.dsn');
			if (!dsnFile) {
				throw new Error(t('Failed to get DSN file, please make sure a PCB document is open'));
			}
			const dsnFilename = dsnFile.name;
			this.onLog?.(`${t('DSN file obtained: ')}${dsnFilename}`, 'success');

			this.onLog?.(t('Encoding DSN file...'), 'info');
			const dsnBase64 = await fileToBase64(dsnFile);

			this.onLog?.(t('Creating routing session...'), 'info');
			const session = await FreeRoutingAPI.createSession();
			this.onLog?.(`${t('Session created: ')}${session.id}`, 'info');

			if (this.cancelled) throw new Error('布线已取消');

			const jobName = dsnFilename.replace(/\.dsn$/i, '');
			const job = await FreeRoutingAPI.enqueueJob(session.id, jobName);
			const jobId = job.id;
			this.onLog?.(`${t('Job created: ')}${jobId}`, 'info');

			const settings: Record<string, unknown> = { max_passes: options.maxPasses };
			if (options.routerSettings) {
				Object.assign(settings, options.routerSettings);
			}
			await FreeRoutingAPI.updateSettings(jobId, settings as any);
			this.onLog?.(`${t('Max passes: ')}${options.maxPasses}`, 'info');

			this.onLog?.(t('Uploading DSN file...'), 'info');
			await FreeRoutingAPI.submitInput(jobId, dsnFilename, dsnBase64);
			this.onLog?.(t('DSN file uploaded'), 'success');

			if (this.cancelled) throw new Error('布线已取消');

			this.onLog?.(t('Starting routing...'), 'info');
			await FreeRoutingAPI.startJob(jobId);
			this.onLog?.(t('Routing started!'), 'success');

			const finalState = await this.pollProgress(jobId, dsnFilename, options.maxPasses);

			if (finalState === 'COMPLETED') {
				this.onLog?.(t('Routing complete, fetching results...'), 'success');
				const output = await FreeRoutingAPI.getJobOutput(jobId);

				if (output.statistics) {
					const s = output.statistics;
					this.onLog?.(`${t('Stats: nets ')}${s.routed_net_count ?? 0}${t(' routed | vias ')}${s.via_count ?? 0}`, 'info');
				}

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
					return { success: true, statistics: output.statistics };
				} else {
					this.onLog?.(t('SES import failed'), 'error');
					return { success: false };
				}
			} else if (finalState === 'CANCELLED' && this.cancelled) {
				this.onLog?.(t('Routing stopped, keeping current results'), 'warn');
				return { success: false };
			} else {
				this.onLog?.(`${t('Routing incomplete, state: ')}${finalState}`, 'error');
				return { success: false };
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.onLog?.(`${t('Error: ')}${message}`, 'error');
			throw error;
		} finally {
			this.cleanup();
		}
	}

	private pollProgress(jobId: string, dsnFilename: string, maxPasses: number): Promise<JobState> {
		return new Promise((resolve, reject) => {
			const TERMINAL_STATES: JobState[] = ['COMPLETED', 'FAILED', 'CANCELLED', 'TIMED_OUT'];
			let pollCount = 0;
			let lastStage = '';
			let lastPass = 0;
			let lastPreviewTime = 0;

			this.pollTimer = setInterval(async () => {
				if (this.cancelled) {
					clearInterval(this.pollTimer!);
					resolve('CANCELLED');
					return;
				}

				try {
					pollCount++;
					const status = await FreeRoutingAPI.getJobStatus(jobId);

					if (TERMINAL_STATES.includes(status.state)) {
						clearInterval(this.pollTimer!);
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

					// 实时预览
					const now = Date.now();
					if ((now - lastPreviewTime) >= PREVIEW_INTERVAL && status.state === 'RUNNING') {
						lastPreviewTime = now;
						try {
							const partial = await FreeRoutingAPI.getJobOutputPartial(jobId);
							if (partial && partial.data) {
								this.onLog?.(t('Updating preview...'), 'info');
								await deletePrimitives(await collectRouteIds());
								const filename = partial.filename || dsnFilename.replace(/\.dsn$/i, '.ses');
								await SESImporter.import(partial.data, filename);
								if (partial.statistics) {
									const s = partial.statistics;
									this.onLog?.(`${t('[Preview] routed: ')}${s.routed_net_count ?? 0}${t(' | vias: ')}${s.via_count ?? 0}`, 'info');
								}
							}
						} catch (previewErr) {
							console.warn('[FreeRouting] preview failed:', previewErr);
						}
					}
				} catch (error) {
					clearInterval(this.pollTimer!);
					reject(error);
				}
			}, POLL_INTERVAL);
		});
	}

	cancel(): void {
		if (this.isRouting) {
			this.cancelled = true;
			this.onLog?.(t('Stopping routing...2'), 'warn');
		}
	}

	private cleanup(): void {
		this.isRouting = false;
		this.cancelled = false;
		if (this.pollTimer) {
			clearInterval(this.pollTimer);
			this.pollTimer = undefined;
		}
	}

	isActive(): boolean {
		return this.isRouting;
	}
}
