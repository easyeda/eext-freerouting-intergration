/**
 * FreeRouting 自动布线扩展类型定义
 */

// ==================== 连接状态 ====================

/**
 * WebSocket 连接状态
 */
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

// ==================== 布线选项 ====================

/**
 * 高级路由器设置
 */
export interface RouterSettings {
	/** 过孔成本 (默认: 50) */
	via_costs: number;
	/** 最大线程数 (默认: 4) */
	max_threads: number;
	/** 扇出轮数 (默认: 20) */
	fanout_max_passes: number;
	/** 改进阈值 (默认: 0) */
	improvement_threshold: number;
	/** 拉紧精度 (默认: 500) */
	trace_pull_tight_accuracy: number;
	/** 撕裂成本 (默认: 100) */
	start_ripup_costs: number;
	/** 自动缩颈 (默认: true) */
	automatic_neckdown: boolean;
	/** 允许多种过孔 (默认: true) */
	allowed_via_types: boolean;
}

/**
 * 布线选项
 */
export interface RoutingOptions {
	/** 最大布线轮数 */
	maxPasses: number;
	/** 启用 JLCEDA 层名转换 */
	enableJlcPostprocess: boolean;
	/** 高级路由器设置 (可选) */
	routerSettings?: RouterSettings;
}

/**
 * 布线进度信息
 */
export interface RoutingProgress {
	/** 当前阶段 */
	stage: string;
	/** 进度百分比 (0-100) */
	percentage: number;
	/** 进度消息 */
	message: string;
}

// ==================== WebSocket 消息 ====================

/**
 * 布线统计信息
 */
export interface RoutingStatistics {
	nets?: { total_count: number };
	traces?: { total_count: number };
	vias?: { total_count: number };
}

/**
 * WebSocket 消息类型
 */
export type WSMessageType = 'log' | 'progress' | 'realtime_ses' | 'complete' | 'error';

/**
 * WebSocket 消息日志级别
 */
export type WSLogLevel = 'info' | 'warn' | 'error' | 'success';

/**
 * WebSocket 接收消息
 */
export interface WSMessage {
	/** 消息类型 */
	type: WSMessageType;
	/** 日志消息内容 */
	message?: string;
	/** 日志级别 */
	level?: WSLogLevel;
	/** 进度阶段 */
	stage?: string;
	/** 进度百分比 */
	percentage?: number;
	/** Base64 编码的 SES 数据 */
	data?: string;
	/** SES 文件名 */
	filename?: string;
	/** 错误详情 */
	details?: string;
	/** 布线统计信息 */
	statistics?: RoutingStatistics;
}

/**
 * 布线请求
 */
export interface RoutingRequest {
	/** 请求类型 */
	type: 'route';
	/** 任务 ID */
	jobId: string;
	/** DSN 文件名 */
	filename: string;
	/** Base64 编码的 DSN 文件内容 */
	data: string;
	/** 布线选项 */
	options: RoutingOptions;
}

// ==================== IFrame 通信 ====================

/**
 * IFrame 发送到扩展的消息
 */
export interface IFrameMessage {
	/** 消息类型 */
	type: 'start' | 'cancel' | 'close';
	/** 布线选项 (仅 start 时需要) */
	options?: RoutingOptions;
}

/**
 * 扩展发送到 IFrame 的消息
 */
export interface ExtensionMessage {
	/** 消息类型 */
	type: 'status' | 'log' | 'progress' | 'complete' | 'error' | 'init';
	/** 消息数据 */
	data: unknown;
}

// ==================== 默认值 ====================

/**
 * 默认路由器设置
 */
export const DEFAULT_ROUTER_SETTINGS: RouterSettings = {
	via_costs: 50,
	max_threads: 4,
	fanout_max_passes: 20,
	improvement_threshold: 0,
	trace_pull_tight_accuracy: 500,
	start_ripup_costs: 100,
	automatic_neckdown: true,
	allowed_via_types: true,
};

/**
 * 快速布线默认选项
 */
export const QUICK_ROUTE_OPTIONS: RoutingOptions = {
	maxPasses: 10,
	enableJlcPostprocess: true,
	routerSettings: {
		...DEFAULT_ROUTER_SETTINGS,
		improvement_threshold: 0.1,
	},
};

/**
 * 自定义布线默认选项
 */
export const CUSTOM_ROUTE_DEFAULT_OPTIONS: RoutingOptions = {
	maxPasses: 100,
	enableJlcPostprocess: true,
};

/**
 * WebSocket 服务地址
 */
export const WS_URL = 'ws://127.0.0.1:37865';

/**
 * WebSocket 连接 ID
 */
export const WS_ID = 'freerouting-ws';
