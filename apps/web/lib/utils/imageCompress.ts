import imageCompression from "browser-image-compression";

/**
 * Compresses an image File to a base64 data URL under the given KB limit.
 * Uses browser-image-compression for better quality and orientation fixes.
 */
export async function compressImage(file: File, maxKB = 50): Promise<string> {
    try {
        const options = {
            maxSizeMB: maxKB / 1024,
            maxWidthOrHeight: 800,
            useWebWorker: true,
            initialQuality: 0.8,
        };
        const compressedBlob = await imageCompression(file, options);

        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(compressedBlob);
        });
    } catch (error) {
        console.error("Compression failed, falling back to original", error);

        // Fallback to reading the original file directly
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }
}
