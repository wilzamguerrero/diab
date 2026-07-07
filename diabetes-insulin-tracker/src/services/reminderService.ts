// Reminder service for glucose measurement notifications.
// Uses the browser Notification API to send periodic reminders.

/**
 * Request browser notification permission.
 * Returns true if granted.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

/**
 * Check if a reminder should fire based on last notified time and interval.
 */
export function shouldRemind(lastNotified: string | undefined, intervalHours: number): boolean {
  if (!lastNotified) return true;
  const last = new Date(lastNotified).getTime();
  const now = Date.now();
  return (now - last) >= intervalHours * 60 * 60 * 1000;
}

/**
 * Show a browser notification reminder.
 */
export function showReminder(): void {
  if (Notification.permission !== 'granted') return;
  new Notification('💉 Recordatorio de glucosa', {
    body: 'Es hora de medir tu glucosa. ¡No olvides registrar tu lectura!',
    icon: '/favicon.ico',
    tag: 'glucose-reminder',
  });
}
