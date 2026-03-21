import { useState, useRef } from "react";

export default function Photo({ task, questionData, answer, onChange, disabled }) {
  const [preview, setPreview] = useState(answer && answer.startsWith("data:image") ? answer : null);
  const [capturing, setCapturing] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileRef = useRef(null);

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    compressAndSet(file);
  }

  function compressAndSet(file) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        // Resize to max 1200px on longest side for reasonable file size
        const maxSize = 1200;
        let w = img.width;
        let h = img.height;
        if (w > maxSize || h > maxSize) {
          if (w > h) { h = Math.round(h * maxSize / w); w = maxSize; }
          else { w = Math.round(w * maxSize / h); h = maxSize; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        setPreview(dataUrl);
        onChange(dataUrl);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  async function startCamera() {
    setCapturing(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 960 } }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      alert("Kamera konnte nicht gestartet werden. Bitte erlaube den Kamerazugriff oder verwende die Dateiauswahl.");
      setCapturing(false);
    }
  }

  function capturePhoto() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    setPreview(dataUrl);
    onChange(dataUrl);
    stopCamera();
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setCapturing(false);
  }

  function removePhoto() {
    setPreview(null);
    onChange("");
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="question-photo">
      {preview ? (
        <div className="photo-preview-container">
          <img src={preview} alt="Aufgenommenes Foto" className="photo-preview" />
          {!disabled && (
            <div className="photo-actions">
              <button type="button" className="btn-small" onClick={removePhoto}>
                Foto entfernen
              </button>
              <button type="button" className="btn-small" onClick={() => fileRef.current?.click()}>
                Anderes Foto waehlen
              </button>
            </div>
          )}
        </div>
      ) : capturing ? (
        <div className="photo-camera-container">
          <video ref={videoRef} autoPlay playsInline className="photo-video" />
          <div className="photo-actions">
            <button type="button" className="btn-primary-sm" onClick={capturePhoto}>
              Foto aufnehmen
            </button>
            <button type="button" className="btn-small" onClick={stopCamera}>
              Abbrechen
            </button>
          </div>
        </div>
      ) : (
        <div className="photo-upload-container">
          <div className="photo-options">
            <button
              type="button"
              className="btn-primary-sm photo-option-btn"
              onClick={startCamera}
              disabled={disabled}
            >
              <span className="photo-option-icon">&#128247;</span>
              Kamera
            </button>
            <button
              type="button"
              className="btn-secondary photo-option-btn"
              onClick={() => fileRef.current?.click()}
              disabled={disabled}
            >
              <span className="photo-option-icon">&#128193;</span>
              Datei waehlen
            </button>
          </div>
          <p className="photo-hint">Fotografiere das Ergebnis mit deiner Kamera oder waehle ein Bild aus.</p>
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFile}
        style={{ display: "none" }}
      />
    </div>
  );
}
