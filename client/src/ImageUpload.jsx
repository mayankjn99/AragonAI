import { useState, useRef } from 'react';
import axios from 'axios';
import './ImageUpload.css';

const ALLOWED_TYPES = ['image/heic', 'image/png', 'image/jpeg'];
const ACCEPT_ATTR = '.heic,.png,.jpg,.jpeg';

function ImageUpload() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [uploads, setUploads] = useState([]);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  const handleFileChange = (e) => {
    handleFile(e.target.files[0]);
  };

  const handleFile = (selected) => {
    setError(null);
    if (!selected) {
      setFile(null);
      setPreview(null);
      return;
    }

    if (!ALLOWED_TYPES.includes(selected.type)) {
      setError(`Invalid file type "${selected.type}". Only HEIC, PNG, and JPEG are allowed.`);
      setFile(null);
      setPreview(null);
      return;
    }

    setFile(selected);
    const reader = new FileReader();
    reader.onloadend = () => setPreview(reader.result);
    reader.readAsDataURL(selected);
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) return;

    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post('http://localhost:3000/api/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setUploads((prev) => [
        { ...response.data, preview, fileName: file.name },
        ...prev,
      ]);
      setFile(null);
      setPreview(null);
      if (inputRef.current) inputRef.current.value = '';
    } catch (err) {
      const message = err.response?.data?.error || err.message || 'Upload failed.';
      setError(message);
    } finally {
      setUploading(false);
    }
  };

  const accepted = uploads.filter((u) => u.status === 'ACCEPTED');
  const rejected = uploads.filter((u) => u.status === 'REJECTED');

  return (
    <div className="app-wrapper">
      <header className="app-header">
        <h1>Image Validator</h1>
        <p className="subtitle">Upload portrait images for automated quality validation</p>
      </header>

      <div className="main-content">
        <section className="upload-section">
          <form onSubmit={handleSubmit}>
            <div
              className={`dropzone ${dragActive ? 'drag-active' : ''} ${preview ? 'has-preview' : ''}`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
            >
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT_ATTR}
                onChange={handleFileChange}
                hidden
              />
              {preview ? (
                <div className="preview-area">
                  <img src={preview} alt="Preview" className="image-preview" />
                  <span className="file-name">{file?.name}</span>
                </div>
              ) : (
                <div className="dropzone-content">
                  <div className="dropzone-icon">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                  </div>
                  <p className="dropzone-text">Drag & drop an image here, or click to browse</p>
                  <p className="dropzone-hint">Supports JPEG, PNG, HEIC — Max 5MB</p>
                </div>
              )}
            </div>

            <button type="submit" disabled={!file || uploading} className="upload-btn">
              {uploading ? (
                <span className="btn-loading">
                  <span className="spinner"></span> Validating...
                </span>
              ) : (
                'Upload & Validate'
              )}
            </button>
          </form>

          {error && <div className="error-banner">{error}</div>}

          <div className="validation-rules">
            <h3>Validation Rules</h3>
            <ul>
              <li><span className="rule-icon">📐</span> Minimum resolution: 500×500 px</li>
              <li><span className="rule-icon">🔍</span> Image must not be blurry</li>
              <li><span className="rule-icon">👤</span> Must contain exactly one face</li>
              <li><span className="rule-icon">📏</span> Face must be at least 5% of image area</li>
            </ul>
          </div>
        </section>

        {uploads.length > 0 && (
          <section className="results-section">
            <div className="results-header">
              <h2>Upload Results</h2>
              <div className="stats">
                <span className="stat accepted">{accepted.length} Accepted</span>
                <span className="stat rejected">{rejected.length} Rejected</span>
              </div>
            </div>

            <div className="results-grid">
              {uploads.map((upload) => (
                <div key={upload.id} className={`result-card ${upload.status.toLowerCase()}`}>
                  <div className="card-image">
                    {upload.preview && <img src={upload.preview} alt={upload.fileName} />}
                    <span className={`badge ${upload.status.toLowerCase()}`}>
                      {upload.status === 'ACCEPTED' ? '✓' : '✗'} {upload.status}
                    </span>
                  </div>
                  <div className="card-body">
                    <p className="card-filename">{upload.fileName}</p>
                    {upload.rejectionReason && (
                      <p className="card-reason">{upload.rejectionReason}</p>
                    )}
                    <p className="card-meta">
                      {new Date(upload.createdAt).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

export default ImageUpload;
