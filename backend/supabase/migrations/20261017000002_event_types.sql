alter table public.security_events drop constraint if exists security_events_type_check;
alter table public.security_events add constraint security_events_type_check check (type in (
  'FAILED_UNLOCK','SIM_CHANGED','SIM_REMOVED','SIM_INSERTED','GEOFENCE_ENTER','GEOFENCE_EXIT',
  'LOST_MODE_ON','LOST_MODE_OFF','ALARM_TRIGGERED','TRACKING_STOPPED','LOW_BATTERY','ADMIN_DISABLED',
  'PHOTO_CAPTURED'));
