/**
 * Base64 编解码工具函数
 */

/**
 * 将 File 对象转换为 Base64 字符串
 * @param file - 要转换的文件
 * @returns Base64 编码的字符串
 */
export function fileToBase64(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			const result = reader.result as string;
			// 移除 data URL 前缀，只保留 Base64 部分
			const base64 = result.split(',')[1];
			resolve(base64);
		};
		reader.onerror = () => {
			reject(new Error('文件读取失败'));
		};
		reader.readAsDataURL(file);
	});
}

/**
 * 将 Base64 字符串转换为 File 对象
 * @param base64 - Base64 编码的字符串
 * @param filename - 文件名
 * @returns File 对象
 */
export function base64ToFile(base64: string, filename: string): File {
	// 解码 Base64 为二进制字符串
	const binaryString = atob(base64);

	// 转换为 Uint8Array
	const bytes = new Uint8Array(binaryString.length);
	for (let i = 0; i < binaryString.length; i++) {
		bytes[i] = binaryString.charCodeAt(i);
	}

	// 创建 Blob 并转换为 File
	const blob = new Blob([bytes], { type: 'application/octet-stream' });
	return new File([blob], filename, { type: 'application/octet-stream' });
}

/**
 * 将 ArrayBuffer 转换为 Base64 字符串
 * @param buffer - ArrayBuffer
 * @returns Base64 编码的字符串
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = '';
	for (let i = 0; i < bytes.byteLength; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}

/**
 * 将 Base64 字符串转换为 ArrayBuffer
 * @param base64 - Base64 编码的字符串
 * @returns ArrayBuffer
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
	const binaryString = atob(base64);
	const bytes = new Uint8Array(binaryString.length);
	for (let i = 0; i < binaryString.length; i++) {
		bytes[i] = binaryString.charCodeAt(i);
	}
	return bytes.buffer;
}
