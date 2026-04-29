/**
 * FreeRouting 路由器
 * 核心布线控制器，协调 DSN 获取、REST API 通信和 SES 导入
 */

import { FreeRoutingAPI } from '../api/FreeRoutingAPI';
import { SESImporter } from '../importer/SESImporter';
import { JobState, POLL_INTERVAL, PREVIEW_INTERVAL, RoutingOptions, RoutingProgress, RoutingStatistics } from '../types';
import { fileToBase64 } from '../utils/base64';

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
			this.onLog?.('正在获取 DSN 文件...', 'info');
			const dsnFile = await eda.pcb_ManufactureData.getDsnFile('design.dsn');
			if (!dsnFile) {
				throw new Error('获取 DSN 文件失败，请确保已打开 PCB 文档');
			}
			const dsnFilename = dsnFile.name;
			this.onLog?.(`DSN 文件获取成功: ${dsnFilename}`, 'success');

			this.onLog?.('正在编码 DSN 文件...', 'info');
			const dsnBase64 = await fileToBase64(dsnFile);

			this.onLog?.('正在创建布线会话...', 'info');
			const session = await FreeRoutingAPI.createSession();
			this.onLog?.(`会话已创建: ${session.id}`, 'info');

			if (this.cancelled) throw new Error('布线已取消');

			const jobName = dsnFilename.replace(/\.dsn$/i, '');
			const job = await FreeRoutingAPI.enqueueJob(session.id, jobName);
			const jobId = job.id;
			this.onLog?.(`任务已创建: ${jobId}`, 'info');

			const settings: Record<string, unknown> = { max_passes: options.maxPasses };
			if (options.routerSettings) {
				Object.assign(settings, options.routerSettings);
			}
			await FreeRoutingAPI.updateSettings(jobId, settings as any);
			this.onLog?.(`最大轮数: ${options.maxPasses}`, 'info');

			this.onLog?.('正在上传 DSN 文件...', 'info');
			await FreeRoutingAPI.submitInput(jobId, dsnFilename, dsnBase64);
			this.onLog?.('DSN 文件上传成功', 'success');

			if (this.cancelled) throw new Error('布线已取消');

			this.onLog?.('正在启动布线...', 'info');
			await FreeRoutingAPI.startJob(jobId);
			this.onLog?.('布线已启动', 'success');

			const finalState = await this.pollProgress(jobId, dsnFilename, options.maxPasses);

			if (finalState === 'COMPLETED') {
				this.onLog?.('布线完成，正在获取最终结果...', 'success');
				const output = await FreeRoutingAPI.getJobOutput(jobId);

				if (output.statistics) {
					const s = output.statistics;
					this.onLog?.(`统计: 网络 ${s.routed_net_count ?? 0} 已布线 | 过孔 ${s.via_count ?? 0}`, 'info');
				}

				this.onLog?.('正在导入最终结果...', 'info');
				await eda.pcb_Document.startCalculatingRatline();
				await deletePrimitives(await collectRouteIds());
				const filename = output.filename || 'routing_result.ses';
				const success = await SESImporter.import(output.data, filename);
				if (success) {
					this.onLog?.('SES 文件导入成功', 'success');
					this.onLog?.('正在执行 DRC 检查...', 'info');
					await eda.pcb_Drc.check(true, true, false);
					this.onLog?.('DRC 检查完成', 'success');
					return { success: true, statistics: output.statistics };
				} else {
					this.onLog?.('SES 文件导入失败', 'error');
					return { success: false };
				}
			} else if (finalState === 'CANCELLED' && this.cancelled) {
				this.onLog?.('布线已停止，保留当前结果', 'warn');
				return { success: false };
			} else {
				this.onLog?.(`布线未完成，状态: ${finalState}`, 'error');
				return { success: false };
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.onLog?.(`错误: ${message}`, 'error');
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

			this.pollTimer = setInterval(async () => {
				if (this.cancelled) {
					clearInterval(this.pollTimer!);
					resolve('CANCELLED');
					return;
				}

				try {
					pollCount++;
					const status = await FreeRoutingAPI.getJobStatus(jobId);

					// 终态检查放在前面，避免终态时还显示进度
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
						'IDLE': eda.sys_I18n.text('Idle') || 'Idle',
						'FANOUT': eda.sys_I18n.text('Fanout') || 'Fanout',
						'ROUTING': eda.sys_I18n.text('Routing') || 'Routing',
						'OPTIMIZING': eda.sys_I18n.text('Optimizing') || 'Optimizing',
						'POSTPROCESSING': eda.sys_I18n.text('Postprocessing') || 'Postprocessing',
					};
					const stageText = stageMap[status.stage || ''] || status.stage || status.state;
					const passText = eda.sys_I18n.text('Routing: Pass ') || 'Pass ';

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
					if (pollCount % PREVIEW_INTERVAL === 0 && status.state === 'RUNNING') {
						try {
							const partial = await FreeRoutingAPI.getJobOutputPartial(jobId);
							if (partial && partial.data) {
								this.onLog?.('正在更新实时预览...', 'info');
								await deletePrimitives(await collectRouteIds());
								const filename = partial.filename || dsnFilename.replace(/\.dsn$/i, '.ses');
								await SESImporter.import(partial.data, filename);
								if (partial.statistics) {
									const s = partial.statistics;
									this.onLog?.(`[预览] 已布线: ${s.routed_net_count ?? 0} | 过孔: ${s.via_count ?? 0}`, 'info');
								}
							}
						} catch (previewErr) {
							console.warn('[FreeRouting] 预览获取失败:', previewErr);
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
			this.onLog?.('正在停止布线...', 'warn');
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
