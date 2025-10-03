/**
 * Utility functions for image processing
 */

/**
 * Resizes an image blob to the specified max dimension while maintaining aspect ratio
 * This helps improve face detection performance on mobile devices
 */
export async function resizeImageBlob(blob: Blob, maxDimension: number = 640): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      
      img.onload = () => {
        // Calculate new dimensions
        let width = img.width;
        let height = img.height;
        
        // Maintain aspect ratio
        if (width > height && width > maxDimension) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else if (height > maxDimension) {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
        
        // Create canvas for resizing
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        
        // Draw and resize
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(url);
          reject(new Error('Could not get canvas context'));
          return;
        }
        
        // Use better quality settings
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);
        
        // Convert back to blob
        canvas.toBlob(
          (resizedBlob) => {
            URL.revokeObjectURL(url);
            if (resizedBlob) {
              console.log(`Image resized from ${img.width}x${img.height} to ${width}x${height}`);
              resolve(resizedBlob);
            } else {
              reject(new Error('Canvas toBlob returned null'));
            }
          },
          blob.type,
          0.9 // High quality
        );
      };
      
      img.onerror = (err) => {
        URL.revokeObjectURL(url);
        reject(new Error('Image load error: ' + err));
      };
      
      img.src = url;
    } catch (err) {
      reject(err);
    }
  });
}
