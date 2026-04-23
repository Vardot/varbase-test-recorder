import React, { useState } from 'react';

/**
 * ConfigPanel — site profile management and generation options.
 */
export default function ConfigPanel({
  profiles,
  activeProfileId,
  genOptions,
  onAddProfile,
  onUpdateProfile,
  onRemoveProfile,
  onSwitchProfile,
  onSetGenOptions,
}) {
  const [editingId, setEditingId] = useState(null);

  const handleOptionChange = (key, value) => {
    onSetGenOptions({ ...genOptions, [key]: value });
  };

  return (
    <div className="config-panel">
      <h3>Site Profiles</h3>

      <div className="profile-list">
        {profiles.map(profile => {
          const isEditing = editingId === profile.id;
          const isActive = profile.id === activeProfileId;

          return (
            <div key={profile.id} className={`profile-card ${isActive ? 'active' : ''}`}>
              {isEditing ? (
                <div className="profile-edit-form">
                  <div className="field">
                    <label>Profile Name</label>
                    <input
                      type="text"
                      value={profile.name}
                      onChange={e => onUpdateProfile(profile.id, { name: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>Base URL</label>
                    <input
                      type="text"
                      value={profile.baseUrl}
                      onChange={e => onUpdateProfile(profile.id, { baseUrl: e.target.value })}
                      placeholder="https://mysite.ddev.site"
                    />
                  </div>
                  <div className="field">
                    <label>Login Path</label>
                    <input
                      type="text"
                      value={profile.loginPath}
                      onChange={e => onUpdateProfile(profile.id, { loginPath: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>Username Selector</label>
                    <input
                      type="text"
                      value={profile.usernameSelector}
                      onChange={e => onUpdateProfile(profile.id, { usernameSelector: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>Password Selector</label>
                    <input
                      type="text"
                      value={profile.passwordSelector}
                      onChange={e => onUpdateProfile(profile.id, { passwordSelector: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>Submit Selector</label>
                    <input
                      type="text"
                      value={profile.submitSelector}
                      onChange={e => onUpdateProfile(profile.id, { submitSelector: e.target.value })}
                    />
                  </div>
                  <button className="btn btn-sm" onClick={() => setEditingId(null)}>Done</button>
                </div>
              ) : (
                <div className="profile-summary">
                  <div className="profile-summary-header">
                    <strong>{profile.name}</strong>
                    {isActive && <span className="active-badge">Active</span>}
                  </div>
                  <span className="profile-url">{profile.baseUrl}</span>
                  <div className="profile-actions">
                    {!isActive && (
                      <button className="btn btn-sm" onClick={() => onSwitchProfile(profile.id)}>
                        Use
                      </button>
                    )}
                    <button className="btn btn-sm" onClick={() => setEditingId(profile.id)}>
                      Edit
                    </button>
                    {profiles.length > 1 && (
                      <button className="btn btn-sm btn-danger" onClick={() => onRemoveProfile(profile.id)}>
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button className="btn btn-add-profile" onClick={() => onAddProfile({ name: 'New Site' })}>
        + Add Site Profile
      </button>

      <hr />

      {/* Generation Options */}
      <h3>Generation Options</h3>

      <div className="gen-options">
        <label className="option-label">
          <input
            type="checkbox"
            checked={genOptions.includeLogin}
            onChange={e => handleOptionChange('includeLogin', e.target.checked)}
          />
          {' '}Include login in beforeEach
        </label>
        <label className="option-label">
          <input
            type="checkbox"
            checked={genOptions.useForceClick}
            onChange={e => handleOptionChange('useForceClick', e.target.checked)}
          />
          {' '}Use {'{ force: true }'} on all interactions
        </label>
        <label className="option-label">
          <input
            type="checkbox"
            checked={genOptions.autoWaits}
            onChange={e => handleOptionChange('autoWaits', e.target.checked)}
          />
          {' '}Auto-add waits after AJAX actions
        </label>
        <label className="option-label">
          <input
            type="checkbox"
            checked={genOptions.importEditContent}
            onChange={e => handleOptionChange('importEditContent', e.target.checked)}
          />
          {' '}Include edit-content test
        </label>
        <label className="option-label">
          <input
            type="checkbox"
            checked={genOptions.importDeleteContent}
            onChange={e => handleOptionChange('importDeleteContent', e.target.checked)}
          />
          {' '}Include delete-content test
        </label>
        <label className="option-label">
          <input
            type="checkbox"
            checked={genOptions.importCloneContent}
            onChange={e => handleOptionChange('importCloneContent', e.target.checked)}
          />
          {' '}Include clone-content test
        </label>
      </div>
    </div>
  );
}
