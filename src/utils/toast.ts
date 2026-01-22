/**
 * Toast 消息工具函数
 * 封装 eda.sys_ToastMessage API 提供统一的消息提示
 */

/**
 * 显示信息提示
 * @param message - 提示消息
 */
export function showInfo(message: string): void {
	eda.sys_ToastMessage.showMessage(message, 'info');
}

/**
 * 显示成功提示
 * @param message - 提示消息
 */
export function showSuccess(message: string): void {
	eda.sys_ToastMessage.showMessage(message, 'success');
}

/**
 * 显示错误提示
 * @param message - 提示消息
 */
export function showError(message: string): void {
	eda.sys_ToastMessage.showMessage(message, 'error');
}

/**
 * 显示警告提示
 * @param message - 提示消息
 */
export function showWarning(message: string): void {
	eda.sys_ToastMessage.showMessage(message, 'warning');
}
