import type * as Notifications from 'expo-notifications';

type PermissionResponseFields = {
  granted?: boolean;
  status?: 'denied' | 'granted' | 'undetermined';
};

export function isNotificationPermissionGranted(
  permissions: Notifications.NotificationPermissionsStatus,
): boolean {
  const response = permissions as unknown as PermissionResponseFields;
  return response.granted === true || response.status === 'granted';
}
