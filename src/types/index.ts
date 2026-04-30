/**
 * FreeRouting 自动布线扩展类型定义
 */

// ==================== API 配置 ====================

/**
 * FreeRouting REST API 基础地址
 */
export const API_BASE_URL = 'http://127.0.0.1:37864/v1';

/**
 * 健康检查轮询间隔 (毫秒)
 */
export const HEALTH_CHECK_INTERVAL = 2000;

/**
 * 健康检查最大重试次数 (~60s)
 */
export const HEALTH_CHECK_MAX_RETRIES = 30;

// ==================== 布线选项 ====================

/**
 * 高级路由器设置
 */
export interface RouterSettings {
	/** 过孔成本 (默认: 50) */
	via_costs: number;
	/** 最大线程数 (默认: 4) */
	max_threads: number;
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
	/** 跳过 DRC 检查 */
	skipDrc?: boolean;
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

// ==================== REST API 响应类型 ====================

/**
 * 布线统计信息
 */
export interface RoutingStatistics {
	layers?: { total_count?: number };
	components?: { total_count?: number };
	nets?: { total_count?: number };
	traces?: { total_count?: number };
	vias?: { total_count?: number };
}

/**
 * 任务状态
 */
export type JobState = 'QUEUED' | 'READY_TO_START' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'CANCELLED' | 'FAILED' | 'TIMED_OUT';

/**
 * 任务阶段
 */
export type JobStage = 'IDLE' | 'FANOUT' | 'ROUTING' | 'OPTIMIZING' | 'POSTPROCESSING';

/**
 * 创建会话响应
 */
export interface SessionResponse {
	id: string;
	user_id?: string;
	host?: string;
}

/**
 * 任务响应
 */
export interface JobResponse {
	id: string;
	session_id: string;
	name: string;
	state: JobState;
	stage?: JobStage;
	priority?: string;
	created_at?: string;
	started_at?: string;
	current_pass?: number;
	router_settings?: {
		max_passes?: number;
		[key: string]: unknown;
	};
	input?: {
		size?: number;
		format?: string;
		filename?: string;
		statistics?: RoutingStatistics;
	};
	output?: {
		size?: number;
		format?: string;
		filename?: string;
		statistics?: RoutingStatistics;
	};
}

/**
 * 任务输出响应
 */
export interface JobOutputResponse {
	job_id: string;
	data: string;
	size?: number;
	crc32?: number;
	format?: string;
	filename?: string;
	statistics?: RoutingStatistics;
}

/**
 * 系统状态响应
 */
export interface SystemStatusResponse {
	status: string;
	cpu_load?: number;
	ram_used?: number;
	ram_available?: number;
	session_count?: number;
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
	maxPasses: 50,
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
 * 进度轮询间隔 (毫秒)
 */
export const POLL_INTERVAL = 2000;

/**
 * 实时预览最小间隔 (毫秒)
 */
export const PREVIEW_INTERVAL = 6000;
