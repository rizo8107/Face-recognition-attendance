import React, { useState } from 'react';
import { CameraIcon, CheckCircleIcon, RefreshIcon } from './common/Icons';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

interface UltraFastCameraProps {
  onCapture: (blob: Blob) => void;
  buttonText?: string;
}

/**
 * Ultra-fast camera component optimized for mobile devices
 * Uses direct Capacitor Camera API for immediate access
 * No face processing, just direct camera capture
 */
const UltraFastCamera: React.FC<UltraFastCameraProps> = ({ onCapture, buttonText = "Take Photo" }) => {
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [loading, setLoading] = useState(false);

  // Direct camera access using Capacitor Camera API
  const handleTriggerCamera = async () => {
    try {
      setLoading(true);
      
      // Use Camera API directly with proper enums
      const photo = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        saveToGallery: false, // Don't save to gallery
        source: CameraSource.Camera, // Explicitly using Camera source only
        promptLabelHeader: 'Take Attendance Photo',
        promptLabelCancel: 'Cancel',
        width: 800,
        height: 800,
        correctOrientation: true
      });

      console.log('Photo captured:', photo);
      
      // Process the photo
      if (photo && photo.webPath) {
        try {
          // Convert URI to blob
          const response = await fetch(photo.webPath);
          const blob = await response.blob();
          
          // Set the captured image
          setCapturedImage(photo.webPath);
          setCapturedBlob(blob);
        } catch (error) {
          console.error('Error processing photo:', error);
          alert('Error processing photo. Please try again.');
        }
      }
    } catch (error) {
      console.error('Camera error:', error);
      if (error.message?.includes('cancelled')) {
        // User cancelled - don't show error
      } else {
        alert('Camera error. Please try again.');
      }
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
  };

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-lg mx-auto">
      <div className="relative w-full aspect-[4/3] bg-white rounded-2xl overflow-hidden shadow-lg border border-gray-200 flex items-center justify-center">
        {capturedImage ? (
          <img src={capturedImage} alt="Captured" className="w-full h-full object-cover" />
        ) : (
          <div className="flex flex-col items-center justify-center h-full p-4 bg-gray-50 text-slate-600">
            <CameraIcon className="w-10 h-10 mb-3 text-[#0A3172]" />
            <p className="text-sm">{loading ? "Opening camera..." : "Tap below to open camera"}</p>
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
            onClick={handleTriggerCamera} 
            disabled={loading}
            className="w-full flex items-center justify-center py-3 px-4 bg-[#0A3172] hover:bg-[#072658] text-white font-medium rounded-xl shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed">
            <CameraIcon className="w-5 h-5 mr-2" />
            {loading ? "Opening camera..." : buttonText}
          </button>
        )}
      </div>
    </div>
  );
};

export default UltraFastCamera;
