/**
 * FreeRouting REST API 客户端
 */

import { API_BASE_URL, JobOutputResponse, JobResponse, RouterSettings, SessionResponse, SystemStatusResponse } from '../types';

async function request<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> {
	const url = `${API_BASE_URL}${path}`;
	const data = body ? JSON.stringify(body) : undefined;
	const headers: Record<string, string> = {
		'Freerouting-Environment-Host': 'EasyEDA/3.2',
		'Freerouting-Profile-ID': '4c11cc11-75b4-4eaa-96b8-95a71d3611ef',
	};
	if (body) {
		headers['Content-Type'] = 'application/json';
	}

	const res = await eda.sys_ClientUrl.request(url, method, data, Object.keys(headers).length ? { headers } : undefined);
	if (!res.ok) {
		const text = await res.text().catch(() => '');
		throw new Error(`API ${method} ${path} failed (${res.status}): ${text}`);
	}
	if (res.status === 204) return undefined as T;
	return res.json() as Promise<T>;
}

export type ServiceCheckResult = 'ok' | 'permission-denied' | 'unavailable';

export class FreeRoutingAPI {
	/**
	 * 检测 FreeRouting 服务状态
	 * 未开启扩展“外部交互”权限时，sys_ClientUrl 会抛出固定错误，据此单独区分
	 */
	static async checkService(): Promise<ServiceCheckResult> {
		try {
			await request('GET', '/system/status');
			return 'ok';
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (/外部交互|external interaction/i.test(message)) {
				return 'permission-denied';
			}
			return 'unavailable';
		}
	}

	static async healthCheck(): Promise<boolean> {
		return (await FreeRoutingAPI.checkService()) === 'ok';
	}

	static getSystemStatus(): Promise<SystemStatusResponse> {
		return request('GET', '/system/status');
	}

	static createSession(): Promise<SessionResponse> {
		return request('POST', '/sessions/create');
	}

	static enqueueJob(sessionId: string, name: string): Promise<JobResponse> {
		return request('POST', '/jobs/enqueue', { session_id: sessionId, name, priority: 'NORMAL' });
	}

	static updateSettings(jobId: string, settings: Partial<RouterSettings> & { max_passes?: number }): Promise<void> {
		return request('POST', `/jobs/${jobId}/settings`, settings);
	}

	static submitInput(jobId: string, filename: string, data: string): Promise<void> {
		return request('POST', `/jobs/${jobId}/input`, { filename, data });
	}

	static startJob(jobId: string): Promise<void> {
		return request('PUT', `/jobs/${jobId}/start`);
	}

	static cancelJob(jobId: string): Promise<void> {
		return request('PUT', `/jobs/${jobId}/cancel`);
	}

	static getJobStatus(jobId: string): Promise<JobResponse> {
		return request('GET', `/jobs/${jobId}`);
	}

	static getJobOutput(jobId: string): Promise<JobOutputResponse> {
		return request('GET', `/jobs/${jobId}/output`);
	}

	/**
	 * 获取任务输出（含中间结果）
	 * 200 = 最终结果, 202 = 中间结果, 204 = 暂无数据
	 */
	static async getJobOutputPartial(jobId: string): Promise<JobOutputResponse | null> {
		const url = `${API_BASE_URL}/jobs/${jobId}/output`;
		const res = await eda.sys_ClientUrl.request(url, 'GET', undefined, {
			headers: {
				'Freerouting-Environment-Host': 'EasyEDA/3.2',
				'Freerouting-Profile-ID': '4c11cc11-75b4-4eaa-96b8-95a71d3611ef',
			},
		});
		if (res.status === 204) return null;
		if (res.status === 200 || res.status === 202) {
			return res.json() as Promise<JobOutputResponse>;
		}
		return null;
	}
}
