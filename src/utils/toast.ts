/**
 * Toast 消息工具函数
 */

function t(key: string): string {
	return eda.sys_I18n.text(key) || key;
}

export function showInfo(message: string, timer?: number): void {
	eda.sys_ToastMessage.showMessage(message, 'info' as any, timer);
}

export function showSuccess(message: string): void {
	eda.sys_ToastMessage.showMessage(message, 'success' as any);
}

export function showError(message: string): void {
	eda.sys_ToastMessage.showMessage(message, 'error' as any);
}

export function showWarning(message: string, timer?: number): void {
	eda.sys_ToastMessage.showMessage(message, 'warn' as any, timer);
}

export { t };
