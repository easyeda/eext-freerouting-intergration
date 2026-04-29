/**
 * FreeRouting REST API 客户端
 */

import { API_BASE_URL, JobOutputResponse, JobResponse, RouterSettings, SessionResponse, SystemStatusResponse } from '../types';

async function request<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> {
	const url = `${API_BASE_URL}${path}`;
	const data = body ? JSON.stringify(body) : undefined;
	const headers: Record<string, string> = {
		'Freerouting-Environment-Host': 'EasyEDA/3.2',
		'Freerouting-Profile-ID': '00000000-0000-0000-0000-ea51eda00001',
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

export class FreeRoutingAPI {
	static async healthCheck(): Promise<boolean> {
		try {
			await request('GET', '/system/status');
			return true;
		} catch {
			return false;
		}
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
				'Freerouting-Profile-ID': '00000000-0000-0000-0000-ea51eda00001',
			},
		});
		if (res.status === 204) return null;
		if (res.status === 200 || res.status === 202) {
			return res.json() as Promise<JobOutputResponse>;
		}
		return null;
	}
}
