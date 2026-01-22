/**
 * SES 文件导入器
 * 将 FreeRouting 布线结果导入到 PCB
 */

import { base64ToFile } from '../utils/base64';

/**
 * SES 文件导入器类
 */
export class SESImporter {
	/**
	 * 导入 SES 文件到当前 PCB
	 * @param sesBase64 - Base64 编码的 SES 文件内容
	 * @param filename - SES 文件名
	 * @returns 导入是否成功
	 */
	static async import(sesBase64: string, filename: string): Promise<boolean> {
		try {
			console.log('[FreeRouting] 正在导入 SES 文件:', filename);

			// 将 Base64 转换为 File 对象
			const sesFile = base64ToFile(sesBase64, filename);

			// 调用 EDA API 导入 SES 文件
			// 注意：根据用户提供的 API，使用 importAutoRouteSesFile
			// 但实际 API 可能是 importAutoRouteJsonFile，需要根据实际情况调整
			const result = await (eda.pcb_Document as any).importAutoRouteSesFile(sesFile);

			if (result) {
				console.log('[FreeRouting] SES 文件导入成功');
				return true;
			} else {
				console.error('[FreeRouting] SES 文件导入失败: API 返回 false');
				return false;
			}
		} catch (error) {
			console.error('[FreeRouting] SES 文件导入错误:', error);
			throw error;
		}
	}

	/**
	 * 验证 Base64 SES 数据是否有效
	 * @param sesBase64 - Base64 编码的 SES 文件内容
	 * @returns 数据是否有效
	 */
	static isValidSesData(sesBase64: string): boolean {
		if (!sesBase64 || typeof sesBase64 !== 'string') {
			return false;
		}

		try {
			// 尝试解码 Base64
			const decoded = atob(sesBase64);
			// SES 文件应该以 (session 开头
			return decoded.trim().startsWith('(session');
		} catch {
			return false;
		}
	}
}
