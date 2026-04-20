const AUTO_REGISTER_SUPPORTED_MODELS = new Set([
  'SS 3531 MF LITE',
  'SS 3542 MF LITE',
  'SS 3532 MF',
  'SS 3532 MF W',
  'SS 3542 MF W',
  'SS 5531 MF W',
  'SS 5531 MF EX',
  'SS 5541 MF W',
  'SS 5532 MF W',
  'SS 5542 MF W',
]);

const AUTO_REGISTER_MINIMUM_FIRMWARE = '20251201';

function normalizeModel(model?: string | null) {
  if (!model) return '';
  return model
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
}

function extractFirmwareBuild(firmwareVer?: string | null): string | null {
  if (!firmwareVer) return null;
  const digits = firmwareVer.replace(/\D/g, '');
  if (digits.length < 8) return null;
  return digits.slice(0, 8);
}

export interface IntelbrasAutoRegisterCompatibility {
  supportedModel: boolean;
  minimumFirmwareBuild: string;
  detectedFirmwareBuild: string | null;
  firmwareSupported: boolean | null;
  ready: boolean;
  notes: string[];
}

export function evaluateIntelbrasAutoRegisterCompatibility(
  model?: string | null,
  firmwareVer?: string | null,
): IntelbrasAutoRegisterCompatibility {
  const normalizedModel = normalizeModel(model);
  const detectedFirmwareBuild = extractFirmwareBuild(firmwareVer);
  const supportedModel = AUTO_REGISTER_SUPPORTED_MODELS.has(normalizedModel);
  const firmwareSupported = detectedFirmwareBuild
    ? detectedFirmwareBuild >= AUTO_REGISTER_MINIMUM_FIRMWARE
    : null;

  const notes: string[] = [];
  if (!supportedModel) {
    notes.push('Modelo fora da lista conhecida de AutoRegister CGI.');
  }
  if (supportedModel && firmwareSupported === null) {
    notes.push('Firmware nao informado; validar build minima antes da ativacao.');
  }
  if (supportedModel && firmwareSupported === false) {
    notes.push(`Firmware abaixo da build minima ${AUTO_REGISTER_MINIMUM_FIRMWARE}.`);
  }
  if (supportedModel && firmwareSupported !== false) {
    notes.push('Elegivel para fluxo AutoRegister CGI do edge local.');
  }

  return {
    supportedModel,
    minimumFirmwareBuild: AUTO_REGISTER_MINIMUM_FIRMWARE,
    detectedFirmwareBuild,
    firmwareSupported,
    ready: supportedModel && firmwareSupported !== false,
    notes,
  };
}
