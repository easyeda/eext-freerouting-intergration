/**
 * FreeRouting 路由器
 * 核心布线控制器，协调 DSN 获取、REST API 通信和 SES 导入
 */

import { FreeRoutingAPI } from '../api/FreeRoutingAPI';
import { SESImporter } from '../importer/SESImporter';
import { JobState, POLL_INTERVAL, PREVIEW_INTERVAL, RoutingOptions, RoutingProgress } from '../types';
import { fileToBase64 } from '../utils/base64';

export type ProgressCallback = (progress: RoutingProgress) => void;
export type LogCallback = (message: string, level: string) => void;

async function clearExistingRoutes(): Promise<void> {
	const lineIds = await eda.pcb_PrimitiveLine.getAllPrimitiveId(undefined, undefined, false);
	if (lineIds.length) await eda.pcb_PrimitiveLine.delete(lineIds);

	const arcIds = await eda.pcb_PrimitiveArc.getAllPrimitiveId(undefined, undefined, false);
	if (arcIds.length) await eda.pcb_PrimitiveArc.delete(arcIds);

	const viaIds = await eda.pcb_PrimitiveVia.getAllPrimitiveId(undefined, false);
	if (viaIds.length) await eda.pcb_PrimitiveVia.delete(viaIds);
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

	async route(options: RoutingOptions): Promise<boolean> {
		if (this.isRouting) {
			throw new Error('布线正在进行中');
		}

		this.isRouting = true;
		this.cancelled = false;

		try {
			// 1. 获取 DSN 文件
			this.onLog?.('正在获取 DSN 文件...', 'info');
			this.onProgress?.({ stage: '获取 DSN', percentage: 0, message: '正在获取 DSN 文件...' });
			const dsnFile = await eda.pcb_ManufactureData.getDsnFile('design.dsn');
			if (!dsnFile) {
				throw new Error('获取 DSN 文件失败，请确保已打开 PCB 文档');
			}
			const dsnFilename = dsnFile.name;
			this.onLog?.(`DSN 文件获取成功: ${dsnFilename}`, 'success');

			// 2. 编码为 Base64
			this.onLog?.('正在编码 DSN 文件...', 'info');
			const dsnBase64 = await fileToBase64(dsnFile);

			// 3. 创建会话
			this.onLog?.('正在创建布线会话...', 'info');
			this.onProgress?.({ stage: '创建会话', percentage: 0, message: '正在创建会话...' });
			const session = await FreeRoutingAPI.createSession();
			this.onLog?.(`会话已创建: ${session.id}`, 'info');

			if (this.cancelled) throw new Error('布线已取消');

			// 4. 创建任务
			const jobName = dsnFilename.replace(/\.dsn$/i, '');
			const job = await FreeRoutingAPI.enqueueJob(session.id, jobName);
			const jobId = job.id;
			this.onLog?.(`任务已创建: ${jobId}`, 'info');

			// 5. 设置布线参数
			const settings: Record<string, unknown> = { max_passes: options.maxPasses };
			if (options.routerSettings) {
				Object.assign(settings, options.routerSettings);
			}
			await FreeRoutingAPI.updateSettings(jobId, settings as any);
			this.onLog?.(`最大轮数: ${options.maxPasses}`, 'info');
			if (options.routerSettings) {
				this.onLog?.('高级设置已启用', 'info');
			}

			// 6. 提交 DSN 输入
			this.onLog?.('正在上传 DSN 文件...', 'info');
			this.onProgress?.({ stage: '上传文件', percentage: 0, message: '正在上传...' });
			await FreeRoutingAPI.submitInput(jobId, dsnFilename, dsnBase64);
			this.onLog?.('DSN 文件上传成功', 'success');

			if (this.cancelled) throw new Error('布线已取消');

			// 7. 启动布线
			this.onLog?.('正在启动布线...', 'info');
			this.onProgress?.({ stage: '布线中', percentage: 0, message: '正在布线...' });
			await FreeRoutingAPI.startJob(jobId);
			this.onLog?.('布线已启动', 'success');

			// 8. 轮询进度 + 实时预览
			const finalState = await this.pollProgress(jobId, dsnFilename);

			if (finalState === 'COMPLETED') {
				// 9. 获取最终输出
				this.onLog?.('布线完成，正在获取最终结果...', 'success');
				this.onProgress?.({ stage: '导入结果', percentage: 0, message: '正在获取结果...' });
				const output = await FreeRoutingAPI.getJobOutput(jobId);

				if (output.statistics) {
					const s = output.statistics;
					this.onLog?.(`统计: 网络 ${s.routed_net_count ?? 0} 已布线 | 过孔 ${s.via_count ?? 0}`, 'info');
				}

				// 10. 清除旧路由并导入最终 SES
				this.onLog?.('正在清除旧路由并导入最终结果...', 'info');
				await clearExistingRoutes();
				const filename = output.filename || 'routing_result.ses';
				const success = await SESImporter.import(output.data, filename);
				if (success) {
					this.onLog?.('SES 文件导入成功', 'success');
					return true;
				} else {
					this.onLog?.('SES 文件导入失败', 'error');
					return false;
				}
			} else if (finalState === 'CANCELLED' && this.cancelled) {
				this.onLog?.('布线已停止，保留当前结果', 'warn');
				return false;
			} else {
				this.onLog?.(`布线未完成，状态: ${finalState}`, 'error');
				return false;
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.onLog?.(`错误: ${message}`, 'error');
			throw error;
		} finally {
			this.cleanup();
		}
	}

	private pollProgress(jobId: string, dsnFilename: string): Promise<JobState> {
		return new Promise((resolve, reject) => {
			const TERMINAL_STATES: JobState[] = ['COMPLETED', 'FAILED', 'CANCELLED', 'TIMED_OUT'];
			let pollCount = 0;
			let lastStage = '';

			this.pollTimer = setInterval(async () => {
				if (this.cancelled) {
					clearInterval(this.pollTimer!);
					resolve('CANCELLED');
					return;
				}

				try {
					pollCount++;
					const status = await FreeRoutingAPI.getJobStatus(jobId);

					const currentStage = `${status.stage || ''}_${status.state}`;
					if (currentStage !== lastStage) {
						lastStage = currentStage;
						this.onProgress?.({
							stage: status.stage || status.state,
							percentage: 0,
							message: `阶段: ${status.stage || '-'} | 状态: ${status.state}`,
						});
					}

					// 实时预览：每 PREVIEW_INTERVAL 次轮询获取一次中间结果
					if (pollCount % PREVIEW_INTERVAL === 0 && status.state === 'RUNNING') {
						try {
							const partial = await FreeRoutingAPI.getJobOutputPartial(jobId);
							if (partial && partial.data) {
								this.onLog?.('正在更新实时预览...', 'info');
								await clearExistingRoutes();
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

					if (TERMINAL_STATES.includes(status.state)) {
						clearInterval(this.pollTimer!);
						resolve(status.state);
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
