import React from 'react';
import { useFamily } from '../../context/FamilyContext';
import { formatDistanceToNow } from 'date-fns';
import {
  MapPin,
  Gauge,
  BatteryCharging,
  AlertOctagon,
  WifiOff,
  Ghost,
  CheckCheck,
  Bell,
} from 'lucide-react';

export default function AlertsPanel() {
  const { alerts, markAlertRead, markAllAlertsRead } = useFamily();

  const unreadCount = alerts.filter(a => !a.is_read && !a.isRead).length;

  const getAlertIcon = (type) => {
    switch (type) {
      case 'geofence_enter':
      case 'geofence_exit':
        return <MapPin size={18} />;
      case 'speed':
        return <Gauge size={18} />;
      case 'battery_low':
        return <BatteryCharging size={18} />;
      case 'sos':
        return <AlertOctagon size={18} />;
      case 'ghost_mode':
        return <Ghost size={18} />;
      case 'offline':
      default:
        return <WifiOff size={18} />;
    }
  };

  const getAlertIconClass = (type) => {
    if (type?.startsWith('geofence')) return 'icon-geofence';
    if (type === 'speed') return 'icon-speed';
    if (type === 'battery_low') return 'icon-battery';
    if (type === 'sos') return 'icon-sos';
    if (type === 'ghost_mode') return 'icon-ghost_mode';
    return 'icon-offline';
  };

  const getAlertCardClass = (type) => {
    if (type?.startsWith('geofence')) return 'alert-geofence';
    if (type === 'speed') return 'alert-speed';
    if (type === 'battery_low') return 'alert-battery';
    if (type === 'sos') return 'alert-sos';
    if (type === 'ghost_mode') return 'alert-ghost_mode';
    return 'alert-offline';
  };

  return (
    <div className="alerts-panel">
      <div className="alerts-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Bell size={16} className="text-primary" />
          <h3>Safety Alerts</h3>
          {unreadCount > 0 && (
            <span className="unread-badge">{unreadCount}</span>
          )}
        </div>

        {unreadCount > 0 && (
          <button
            className="btn btn-ghost"
            onClick={markAllAlertsRead}
            style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px' }}
          >
            <CheckCheck size={14} />
            <span>Mark all read</span>
          </button>
        )}
      </div>

      {alerts.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🔔</div>
          <h4>All Quiet & Safe</h4>
          <p>No safety alerts yet. Alerts for geofencing, speed limits, low battery, and SOS will show up here.</p>
        </div>
      ) : (
        alerts.map((alert) => {
          const isUnread = !alert.is_read && !alert.isRead;
          return (
            <div
              key={alert.id || alert._id}
              className={`alert-card ${getAlertCardClass(alert.type)} ${isUnread ? 'unread' : ''}`}
              onClick={() => isUnread && markAlertRead(alert.id || alert._id)}
            >
              <div className={`alert-icon ${getAlertIconClass(alert.type)}`}>
                {getAlertIcon(alert.type)}
              </div>

              <div className="alert-body">
                <div className="alert-title">{alert.title}</div>
                <div className="alert-message">{alert.message}</div>
                <div className="alert-time">
                  {alert.created_at
                    ? formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })
                    : 'Just now'}
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

