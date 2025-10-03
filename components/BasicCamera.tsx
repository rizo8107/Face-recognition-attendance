import React, { useState } from 'react';
import { CameraIcon, CheckCircleIcon, RefreshIcon } from './common/Icons';

interface BasicCameraProps {
  onCapture: (blob: Blob) => void;
  onCancel?: () => void;
  buttonText?: string;
}

/**
 * Super lightweight camera component with minimal processing
 * Uses direct Capacitor Camera plugin on Android with no face detection
 */
const BasicCamera: React.FC<BasicCameraProps> = ({ 
  onCapture, 
  onCancel, 
  buttonText = "Take Photo" 
}) => {
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Direct camera capture with minimal processing
  const handleCapture = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Dynamic import to avoid bundling issues
      const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
      
      console.log("Taking photo with basic camera...");
      const image = await Camera.getPhoto({
        quality: 75, // Lower quality for speed
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera,
        saveToGallery: false,
        width: 800,
        height: 800,
        correctOrientation: true
      });
      
      if (image.webPath) {
        try {
          const response = await fetch(image.webPath);
          const blob = await response.blob();
          setCapturedBlob(blob);
          setCapturedImage(URL.createObjectURL(blob));
        } catch (err) {
          setError("Failed to process image");
          console.error("Image processing error:", err);
        }
      } else {
        setError("No image captured");
      }
    } catch (err) {
      setError("Camera error - please check permissions");
      console.error("Camera error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    if (capturedBlob) {
      onCapture(capturedBlob);
    }
  };
  
  const handleRetake = () => {
    if (capturedImage) {
      URL.revokeObjectURL(capturedImage);
    }
    setCapturedImage(null);
    setCapturedBlob(null);
    setError(null);
  };

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-lg mx-auto">
      <div className="relative w-full aspect-[4/3] bg-white rounded-2xl overflow-hidden shadow-lg border border-gray-200 flex items-center justify-center">
        {capturedImage ? (
          <img src={capturedImage} alt="Captured" className="w-full h-full object-cover" />
        ) : (
          <div className="flex flex-col items-center justify-center h-full p-4 bg-gray-50 text-slate-600">
            <CameraIcon className="w-10 h-10 mb-3 text-[#0A3172]" />
            <p className="text-sm">{loading ? "Processing..." : "Tap to take photo"}</p>
            {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
          </div>
        )}
      </div>

      <div className="flex w-full justify-center gap-3">
        {capturedImage ? (
          <>
            <button 
              onClick={handleRetake} 
              className="flex-1 flex items-center justify-center py-2 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl shadow-sm transition-all duration-200">
              <RefreshIcon className="w-5 h-5 mr-2" />
              Retake
            </button>
            <button 
              onClick={handleConfirm} 
              className="flex-1 flex items-center justify-center py-2 px-4 bg-[#0A3172] hover:bg-[#072658] text-white font-medium rounded-xl shadow-md hover:shadow-lg transition-all duration-200">
              <CheckCircleIcon className="w-5 h-5 mr-2" />
              Confirm
            </button>
          </>
        ) : (
          <button 
            onClick={handleCapture} 
            disabled={loading}
            className="w-full flex items-center justify-center py-3 px-4 bg-[#0A3172] hover:bg-[#072658] text-white font-medium rounded-xl shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed">
            <CameraIcon className="w-5 h-5 mr-2" />
            {loading ? "Processing..." : buttonText}
          </button>
        )}
      </div>
    </div>
  );
};

export default BasicCamera;
