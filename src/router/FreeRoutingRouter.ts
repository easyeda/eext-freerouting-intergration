/**
 * FreeRouting 路由器
 * 核心布线控制器，协调 DSN 获取、WebSocket 通信和 SES 导入
 */

import { SESImporter } from '../importer/SESImporter';
import { ConnectionStatus, RoutingOptions, RoutingProgress, RoutingRequest, WSMessage } from '../types';
import { fileToBase64 } from '../utils/base64';
import { WebSocketManager } from '../websocket/WebSocketManager';

/**
 * 进度回调函数类型
 */
export type ProgressCallback = (progress: RoutingProgress) => void;

/**
 * 日志回调函数类型
 */
export type LogCallback = (message: string, level: string) => void;

/**
 * 状态回调函数类型
 */
export type StatusCallback = (status: ConnectionStatus) => void;

/**
 * FreeRouting 路由器类
 */
export class FreeRoutingRouter {
	private wsManager: WebSocketManager | null = null;
	private onProgress?: ProgressCallback;
	private onLog?: LogCallback;
	private onStatus?: StatusCallback;
	private isRouting = false;
	private routeResolve?: (success: boolean) => void;
	private routeReject?: (error: Error) => void;
	private currentJobId?: string;

	/**
	 * 创建路由器实例
	 * @param onProgress - 进度回调
	 * @param onLog - 日志回调
	 * @param onStatus - 状态回调
	 */
	constructor(onProgress?: ProgressCallback, onLog?: LogCallback, onStatus?: StatusCallback) {
		this.onProgress = onProgress;
		this.onLog = onLog;
		this.onStatus = onStatus;
	}

	/**
	 * 处理 WebSocket 消息
	 */
	private handleMessage = async (msg: WSMessage): Promise<void> => {
		switch (msg.type) {
			case 'log':
				this.onLog?.(msg.message || '', msg.level || 'info');
				break;

			case 'progress':
				this.onProgress?.({
					stage: msg.stage || '',
					percentage: msg.percentage || 0,
					message: `${msg.stage}: ${msg.percentage}%`,
				});
				break;

			case 'realtime_ses':
				// 中间结果，只记录日志，不导入
				if (msg.statistics) {
					const nets = msg.statistics.nets?.total_count || 0;
					const traces = msg.statistics.traces?.total_count || 0;
					const vias = msg.statistics.vias?.total_count || 0;
					this.onLog?.(`[实时更新] 网络: ${nets} | 走线: ${traces} | 过孔: ${vias}`, 'info');
				}
				break;

			case 'complete':
				// 最终结果，需要导入
				if (msg.data) {
					this.onLog?.('布线完成，正在导入结果...', 'success');
					try {
						const filename = msg.filename || 'routing_result.ses';
						const success = await SESImporter.import(msg.data, filename);
						if (success) {
							this.onLog?.('SES 文件导入成功', 'success');
							this.routeResolve?.(true);
						} else {
							this.onLog?.('SES 文件导入失败', 'error');
							this.routeResolve?.(false);
						}
					} catch (error) {
						console.error('[FreeRouting] 导入错误:', error);
						this.onLog?.(`导入失败: ${error instanceof Error ? error.message : String(error)}`, 'error');
						this.routeReject?.(error instanceof Error ? error : new Error(String(error)));
					}
				}
				this.cleanup();
				break;

			case 'error':
				console.error('[FreeRouting] 布线错误:', msg.message, msg.details);
				this.onLog?.(`错误: ${msg.message}`, 'error');
				if (msg.details) {
					this.onLog?.(msg.details, 'error');
				}
				this.routeReject?.(new Error(msg.message || '布线失败'));
				this.cleanup();
				break;
		}
	};

	/**
	 * 处理连接状态变化
	 */
	private handleStatusChange = (status: ConnectionStatus): void => {
		this.onStatus?.(status);

		// 如果在布线过程中连接断开，通知错误
		if (status === 'disconnected' && this.isRouting) {
			console.error('[FreeRouting] 布线过程中连接断开');
			this.onLog?.('与 FreeRouting 服务的连接已断开', 'error');
			this.routeReject?.(new Error('与 FreeRouting 服务的连接已断开'));
			this.cleanup();
		}
	};

	/**
	 * 清理资源
	 */
	private cleanup(): void {
		this.isRouting = false;
		this.routeResolve = undefined;
		this.routeReject = undefined;
		this.currentJobId = undefined;

		if (this.wsManager) {
			this.wsManager.disconnect();
			this.wsManager = null;
		}
	}

	/**
	 * 执行自动布线
	 * @param options - 布线选项
	 * @returns 布线是否成功
	 */
	async route(options: RoutingOptions): Promise<boolean> {
		if (this.isRouting) {
			throw new Error('布线正在进行中');
		}

		this.isRouting = true;

		return new Promise(async (resolve, reject) => {
			this.routeResolve = resolve;
			this.routeReject = reject;

			try {
				// 1. 获取 DSN 文件
				this.onLog?.('正在获取 DSN 文件...', 'info');
				this.onProgress?.({ stage: '获取 DSN', percentage: 0, message: '正在获取 DSN 文件...' });

				const dsnFile = await eda.pcb_ManufactureData.getDsnFile();
				if (!dsnFile) {
					throw new Error('获取 DSN 文件失败，请确保已打开 PCB 文档');
				}

				this.onLog?.(`DSN 文件获取成功: ${dsnFile.name}`, 'success');
				this.onProgress?.({ stage: '获取 DSN', percentage: 100, message: 'DSN 文件获取成功' });

				// 2. 编码 DSN 文件为 Base64
				this.onLog?.('正在编码 DSN 文件...', 'info');
				const dsnBase64 = await fileToBase64(dsnFile);

				// 3. 连接 WebSocket
				this.onLog?.('正在连接到 FreeRouting 服务...', 'info');
				this.onProgress?.({ stage: '连接服务', percentage: 0, message: '正在连接到 FreeRouting 服务...' });

				this.wsManager = new WebSocketManager(this.handleMessage, this.handleStatusChange);

				await this.wsManager.connect();
				this.onLog?.('已连接到 FreeRouting 服务', 'success');
				this.onProgress?.({ stage: '连接服务', percentage: 100, message: '已连接到 FreeRouting 服务' });

				// 4. 发送布线请求
				this.currentJobId = `job_${Date.now()}`;
				const request: RoutingRequest = {
					type: 'route',
					jobId: this.currentJobId,
					filename: dsnFile.name,
					data: dsnBase64,
					options: options,
				};

				this.onLog?.('正在发送布线请求...', 'info');
				this.onLog?.(`最大轮数: ${options.maxPasses}`, 'info');
				this.onLog?.(`JLCEDA 转换: ${options.enableJlcPostprocess ? '启用' : '禁用'}`, 'info');

				if (options.routerSettings) {
					this.onLog?.('高级设置已启用', 'info');
				}

				this.onProgress?.({ stage: '布线中', percentage: 0, message: '正在布线...' });
				this.wsManager.send(request);

				// 等待布线完成（通过 handleMessage 中的 complete/error 消息触发 resolve/reject）
			} catch (error) {
				console.error('[FreeRouting] 布线错误:', error);
				this.onLog?.(`错误: ${error instanceof Error ? error.message : String(error)}`, 'error');
				this.cleanup();
				reject(error);
			}
		});
	}

	/**
	 * 取消布线
	 */
	cancel(): void {
		if (this.isRouting) {
			this.onLog?.('正在取消布线...', 'warn');
			this.routeReject?.(new Error('布线已取消'));
			this.cleanup();
		}
	}

	/**
	 * 获取当前是否正在布线
	 */
	isActive(): boolean {
		return this.isRouting;
	}
}
