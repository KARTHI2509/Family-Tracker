import React, { useState } from 'react';
import { useFamily } from '../../context/FamilyContext';
import { MapPin, Trash2, Plus, X, Crosshair, AlertCircle } from 'lucide-react';

export default function GeofenceDrawer({
  isOpen,
  onClose,
  pickedLocation,
  isPickingLocation,
  setIsPickingLocation,
}) {
  const { geofences, createGeofence, deleteGeofence, addToast } = useFamily();
  const [name, setName] = useState('');
  const [radius, setRadius] = useState(250);
  const [color, setColor] = useState('#4F46E5');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [zoneToDelete, setZoneToDelete] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please provide a name for this safe zone.');
      return;
    }
    if (!pickedLocation || pickedLocation.lat == null || pickedLocation.lng == null) {
      setError('Please click on the map to choose the zone center location first.');
      return;
    }

    setError('');
    try {
      setSubmitting(true);
      await createGeofence({
        name: name.trim(),
        latitude: Number(pickedLocation.lat),
        longitude: Number(pickedLocation.lng),
        radius: Number(radius),
        color,
      });
      setName('');
      setIsPickingLocation(false);
    } catch (err) {
      setError(err.message || 'Failed to save safe zone.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!zoneToDelete) return;
    try {
      await deleteGeofence(zoneToDelete.id);
      setZoneToDelete(null);
    } catch (err) {
      addToast('error', 'Delete Failed', err.message || 'Could not delete safe zone.');
    }
  };

  return (
    <div className={`geofence-drawer ${isOpen ? 'open' : ''}`}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h3>
          <MapPin size={18} className="text-primary" />
          Safe Zones & Geofencing
        </h3>
        <button
          className="btn btn-ghost"
          onClick={onClose}
          style={{ padding: '6px', color: 'var(--text-400)' }}
          aria-label="Close Geofence Drawer"
        >
          <X size={18} />
        </button>
      </div>

      {error && (
        <div style={{ color: 'var(--danger-400)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      <form className="geofence-form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label" style={{ fontSize: '12px' }}>Zone Name</label>
          <input
            type="text"
            className="input"
            placeholder="e.g. Home, School, Office"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError('');
            }}
            required
          />
        </div>

        <div className="form-group" style={{ maxWidth: '160px' }}>
          <label className="form-label" style={{ fontSize: '12px' }}>Radius: {radius}m</label>
          <input
            type="range"
            min={50}
            max={2000}
            step={50}
            value={radius}
            onChange={(e) => setRadius(e.target.value)}
            style={{ width: '100%', marginTop: '8px' }}
          />
        </div>

        <div className="form-group" style={{ maxWidth: '60px' }}>
          <label className="form-label" style={{ fontSize: '12px' }}>Color</label>
          <div className="color-input-wrapper">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              title="Pick zone color"
            />
          </div>
        </div>

        <div className="form-group" style={{ minWidth: '160px' }}>
          <label className="form-label" style={{ fontSize: '12px' }}>Location Center</label>
          <button
            type="button"
            className={`btn ${isPickingLocation ? 'btn-primary' : 'btn-secondary'} w-full`}
            onClick={() => setIsPickingLocation(!isPickingLocation)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '13px' }}
          >
            <Crosshair size={14} />
            {isPickingLocation
              ? 'Click Map Now...'
              : pickedLocation
              ? `${pickedLocation.lat.toFixed(4)}, ${pickedLocation.lng.toFixed(4)}`
              : 'Pick on Map'}
          </button>
        </div>

        <button
          type="submit"
          className="btn btn-primary"
          disabled={submitting || !pickedLocation || !name}
          style={{ height: '42px', display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <Plus size={16} />
          <span>{submitting ? 'Saving...' : 'Add Zone'}</span>
        </button>
      </form>

      {/* Existing Geofences List */}
      <div className="geofence-list">
        {geofences.length === 0 ? (
          <div style={{ fontSize: '13px', color: 'var(--text-400)', textAlign: 'center', padding: '12px' }}>
            No safe zones created yet. Click "Pick on Map" to define your family's first zone!
          </div>
        ) : (
          geofences.map((gf) => (
            <div key={gf.id} className="geofence-item">
              <div className="geofence-item-info">
                <div
                  className="geofence-color-dot"
                  style={{ backgroundColor: gf.color || '#4F46E5' }}
                />
                <div>
                  <div className="geofence-item-name">{gf.name}</div>
                  <div className="geofence-item-radius">{gf.radius} meters radius</div>
                </div>
              </div>
              <button
                className="btn btn-ghost"
                onClick={() => setZoneToDelete(gf)}
                title="Delete safe zone"
                style={{ color: 'var(--danger-500)', padding: '6px' }}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {zoneToDelete && (
        <div className="modal-overlay" onClick={() => setZoneToDelete(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Confirm Deletion</h2>
              <button className="modal-close" onClick={() => setZoneToDelete(null)}>
                ×
              </button>
            </div>
            <p className="text-muted text-sm mb-4">
              Are you sure you want to delete the safe zone <strong>"{zoneToDelete.name}"</strong>? You will no longer receive alerts when family members enter or exit this zone.
            </p>
            <div className="flex gap-2">
              <button className="btn btn-secondary" onClick={() => setZoneToDelete(null)} style={{ flex: 1 }}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleConfirmDelete} style={{ flex: 1 }}>
                Delete Zone
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
