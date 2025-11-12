/**
 * Floor Plan Upload Component
 *
 * Allows users to upload a 2D floor plan image for ControlNet-guided generation.
 * Supports drag-and-drop, file selection, and preview.
 */

import React, { useState, useRef } from 'react';

function FloorPlanUpload({ onFloorPlanUploaded, disabled = false }) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewName, setPreviewName] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileSelect = async (file) => {
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file (PNG, JPG, etc.)');
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert('File size must be less than 10MB');
      return;
    }

    setUploading(true);
    setPreviewName(file.name);

    try {
      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target.result);
      reader.readAsDataURL(file);

      // Option 1: Convert to base64 and use directly (simpler, no server upload needed)
      const base64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });

      // Call parent callback with base64 data
      onFloorPlanUploaded(base64, file.name);

      console.log('✅ Floor plan uploaded successfully:', file.name);

      // Option 2: Upload to server (uncomment if you want server storage)
      /*
      const formData = new FormData();
      formData.append('floorPlan', file);

      const response = await fetch('/api/upload-floor-plan', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const { url } = await response.json();
      onFloorPlanUploaded(url, file.name);
      */

    } catch (error) {
      console.error('Floor plan upload failed:', error);
      alert('Failed to upload floor plan. Please try again.');
      handleRemove();
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    handleFileSelect(file);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setDragOver(false);

    const file = event.dataTransfer.files[0];
    handleFileSelect(file);
  };

  const handleDragOver = (event) => {
    event.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleRemove = () => {
    setPreview(null);
    setPreviewName('');
    onFloorPlanUploaded(null, null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClick = () => {
    if (!disabled && !preview) {
      fileInputRef.current?.click();
    }
  };

  return (
    <div className="floor-plan-upload">
      <div className="upload-header">
        <h3>📐 Floor Plan Upload (Optional)</h3>
        <p className="upload-description">
          Upload a 2D floor plan for ControlNet-guided generation. This ensures all views match the exact layout.
        </p>
      </div>

      <div
        className={`upload-area ${dragOver ? 'drag-over' : ''} ${preview ? 'has-preview' : ''} ${disabled ? 'disabled' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={handleClick}
      >
        {preview ? (
          <div className="preview-container">
            <div className="preview-image-wrapper">
              <img src={preview} alt="Floor plan preview" className="preview-image" />
              <div className="preview-overlay">
                <span className="preview-filename">{previewName}</span>
              </div>
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                handleRemove();
              }}
              className="remove-button"
              disabled={disabled}
              type="button"
            >
              ✕ Remove
            </button>
          </div>
        ) : (
          <div className="upload-prompt">
            {uploading ? (
              <div className="uploading-state">
                <div className="spinner"></div>
                <p>Uploading floor plan...</p>
              </div>
            ) : (
              <>
                <div className="upload-icon">
                  <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </div>
                <p className="upload-primary-text">
                  Drag & drop floor plan here
                </p>
                <p className="upload-secondary-text">
                  or click to browse
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  disabled={disabled || uploading}
                  style={{ display: 'none' }}
                />
              </>
            )}
          </div>
        )}
      </div>

      <div className="upload-tips">
        <div className="tips-header">💡 Tips for best results:</div>
        <ul className="tips-list">
          <li>
            <strong>Black-and-white</strong> line drawings work best
          </li>
          <li>
            <strong>Clear wall delineations</strong> - thick walls, thin openings
          </li>
          <li>
            <strong>Minimal furniture</strong> or annotations
          </li>
          <li>
            <strong>PNG or JPG</strong> format, max 10MB
          </li>
          <li>
            <strong>High resolution</strong> - at least 1024×1024 pixels
          </li>
        </ul>
      </div>

      {preview && (
        <div className="controlnet-badge">
          ✅ ControlNet enabled - All views will match this floor plan
        </div>
      )}
    </div>
  );
}

export default FloorPlanUpload;
