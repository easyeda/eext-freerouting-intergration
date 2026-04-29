/**
 * Toast 消息工具函数
 */

function t(key: string): string {
	return eda.sys_I18n.text(key) || key;
}

export function showInfo(message: string, persistent = false): void {
	eda.sys_ToastMessage.showMessage(message, 'info', persistent ? 0 : undefined);
}

export function showSuccess(message: string): void {
	eda.sys_ToastMessage.showMessage(message, 'success');
}

export function showError(message: string): void {
	eda.sys_ToastMessage.showMessage(message, 'error');
}

export function showWarning(message: string): void {
	eda.sys_ToastMessage.showMessage(message, 'warning');
}

export { t };
