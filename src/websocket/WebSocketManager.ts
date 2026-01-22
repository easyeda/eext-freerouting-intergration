/**
 * WebSocket 连接管理器
 * 处理与 FreeRouting 服务的 WebSocket 通信
 */

import { ConnectionStatus, RoutingRequest, WSMessage, WS_ID, WS_URL } from '../types';

/**
 * WebSocket 消息回调函数类型
 */
export type MessageCallback = (msg: WSMessage) => void;

/**
 * 连接状态变化回调函数类型
 */
export type StatusCallback = (status: ConnectionStatus) => void;

/**
 * WebSocket 连接管理器类
 */
export class WebSocketManager {
	private wsId: string;
	private status: ConnectionStatus = 'disconnected';
	private onMessage: MessageCallback;
	private onStatusChange: StatusCallback;
	private connectResolve?: () => void;
	private connectReject?: (error: Error) => void;
	private connectionTimeout?: ReturnType<typeof setTimeout>;

	/**
	 * 创建 WebSocket 管理器实例
	 * @param onMessage - 消息接收回调
	 * @param onStatusChange - 状态变化回调
	 * @param wsId - WebSocket 连接 ID (可选)
	 */
	constructor(onMessage: MessageCallback, onStatusChange: StatusCallback, wsId: string = WS_ID) {
		this.wsId = wsId;
		this.onMessage = onMessage;
		this.onStatusChange = onStatusChange;
	}

	/**
	 * 获取当前连接状态
	 */
	getStatus(): ConnectionStatus {
		return this.status;
	}

	/**
	 * 设置连接状态并通知回调
	 */
	private setStatus(status: ConnectionStatus): void {
		this.status = status;
		this.onStatusChange(status);
	}

	/**
	 * 处理接收到的 WebSocket 消息
	 */
	private handleMessage = (event: MessageEvent): void => {
		try {
			const msg = JSON.parse(event.data) as WSMessage;
			this.onMessage(msg);
		} catch (error) {
			console.error('[FreeRouting] 消息解析错误:', error);
			this.onMessage({
				type: 'error',
				message: '消息解析错误',
				details: error instanceof Error ? error.message : String(error),
			});
		}
	};

	/**
	 * 处理连接建立
	 */
	private handleConnected = (): void => {
		// 清除连接超时
		if (this.connectionTimeout) {
			clearTimeout(this.connectionTimeout);
			this.connectionTimeout = undefined;
		}

		this.setStatus('connected');
		console.log('[FreeRouting] WebSocket 已连接');

		// 解析连接 Promise
		if (this.connectResolve) {
			this.connectResolve();
			this.connectResolve = undefined;
			this.connectReject = undefined;
		}
	};

	/**
	 * 连接到 FreeRouting WebSocket 服务
	 * @param timeout - 连接超时时间 (毫秒)
	 * @returns Promise，连接成功时 resolve
	 */
	connect(timeout: number = 10000): Promise<void> {
		return new Promise((resolve, reject) => {
			if (this.status === 'connected') {
				resolve();
				return;
			}

			this.connectResolve = resolve;
			this.connectReject = reject;

			this.setStatus('connecting');
			console.log('[FreeRouting] 正在连接到 WebSocket 服务...');

			// 设置连接超时
			this.connectionTimeout = setTimeout(() => {
				if (this.status === 'connecting') {
					this.setStatus('disconnected');
					const error = new Error('连接超时，请检查 FreeRouting 服务状态');
					console.error('[FreeRouting]', error.message);
					if (this.connectReject) {
						this.connectReject(error);
						this.connectResolve = undefined;
						this.connectReject = undefined;
					}
				}
			}, timeout);

			try {
				// 使用 EDA WebSocket API 注册连接
				eda.sys_WebSocket.register(this.wsId, WS_URL, this.handleMessage, this.handleConnected);
			} catch (error) {
				// 清除超时
				if (this.connectionTimeout) {
					clearTimeout(this.connectionTimeout);
					this.connectionTimeout = undefined;
				}

				this.setStatus('disconnected');
				const err = error instanceof Error ? error : new Error(String(error));
				console.error('[FreeRouting] WebSocket 注册失败:', err);
				reject(err);
				this.connectResolve = undefined;
				this.connectReject = undefined;
			}
		});
	}

	/**
	 * 发送布线请求
	 * @param request - 布线请求数据
	 */
	send(request: RoutingRequest): void {
		if (this.status !== 'connected') {
			throw new Error('WebSocket 未连接');
		}

		const data = JSON.stringify(request);
		console.log('[FreeRouting] 发送布线请求:', request.filename);
		eda.sys_WebSocket.send(this.wsId, data);
	}

	/**
	 * 断开 WebSocket 连接
	 */
	disconnect(): void {
		// 清除连接超时
		if (this.connectionTimeout) {
			clearTimeout(this.connectionTimeout);
			this.connectionTimeout = undefined;
		}

		if (this.status !== 'disconnected') {
			try {
				eda.sys_WebSocket.close(this.wsId);
				console.log('[FreeRouting] WebSocket 已断开');
			} catch (error) {
				console.error('[FreeRouting] WebSocket 断开失败:', error);
			}
			this.setStatus('disconnected');
		}

		// 清理 Promise
		if (this.connectReject) {
			this.connectReject(new Error('连接已取消'));
			this.connectResolve = undefined;
			this.connectReject = undefined;
		}
	}
}
