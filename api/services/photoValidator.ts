import sharp from 'sharp';

/**
 * Intelbras photo requirements:
 * - Min: 150x300 px
 * - Max: 600x1200 px
 * - Max file size: 100KB
 * - Format: JPEG
 * - Base64 encoded
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  base64?: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
}

export async function validateAndOptimizePhoto(buffer: Buffer): Promise<ValidationResult> {
  const errors: string[] = [];

  try {
    const metadata = await sharp(buffer).metadata();
    const w = metadata.width || 0;
    const h = metadata.height || 0;

    if (w < 150 || h < 300) {
      errors.push(`Dimensões muito pequenas: ${w}x${h} (mín: 150x300)`);
    }

    // Resize if too large
    let processed = sharp(buffer).jpeg({ quality: 85 });

    if (w > 600 || h > 1200) {
      processed = processed.resize(600, 1200, { fit: 'inside', withoutEnlargement: true });
    }

    let outputBuffer = await processed.toBuffer();

    // If still too large, reduce quality iteratively
    let quality = 85;
    while (outputBuffer.length > 100_000 && quality > 20) {
      quality -= 10;
      outputBuffer = await sharp(buffer)
        .resize(600, 1200, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality })
        .toBuffer();
    }

    if (outputBuffer.length > 100_000) {
      errors.push(`Arquivo muito grande: ${Math.round(outputBuffer.length / 1024)}KB (máx: 100KB)`);
    }

    const finalMeta = await sharp(outputBuffer).metadata();

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    return {
      valid: true,
      errors: [],
      base64: outputBuffer.toString('base64'),
      width: finalMeta.width,
      height: finalMeta.height,
      sizeBytes: outputBuffer.length,
    };
  } catch (err: any) {
    return { valid: false, errors: [`Erro ao processar imagem: ${err.message}`] };
  }
}
