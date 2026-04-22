import { IntelbrasAutoRegisterService } from './intelbrasAutoRegisterService';

export const DEVICE_CONNECTION_POLICIES = [
  'auto',
  'edge_only',
  'direct_only',
  'cloud_autoreg_only',
] as const;

export type DeviceConnectionPolicy = typeof DEVICE_CONNECTION_POLICIES[number];
export type DeviceEffectiveTransport = 'edge_local' | 'direct_http' | 'cloud_autoreg' | 'unavailable';
export type DeviceDeliveryMode = 'edge' | 'cloud' | 'unavailable';

interface EdgeSummary {
  id?: string | null;
  name?: string | null;
  status?: string | null;
}

export interface DeviceTransportInput {
  id: string;
  connectivityMode?: string | null;
  connectionPolicy?: string | null;
  localIdentifier?: string | null;
  edgeConnectorId?: string | null;
  edgeConnector?: EdgeSummary | null;
  passwordEnc?: string | null;
}

export interface DeviceTransportResolution {
  connectionPolicy: DeviceConnectionPolicy;
  connectionPolicyLabel: string;
  connectionPolicyHint: string;
  connectivityMode: 'direct' | 'edge';
  effectiveTransport: DeviceEffectiveTransport;
  effectiveTransportLabel: string;
  deliveryMode: DeviceDeliveryMode;
  reason: string;
  autoRegisterConnected: boolean;
  directCapable: boolean;
  edgeAssigned: boolean;
  edgeName: string | null;
}

function isPolicy(value: string | null | undefined): value is DeviceConnectionPolicy {
  return Boolean(value && DEVICE_CONNECTION_POLICIES.includes(value as DeviceConnectionPolicy));
}

export function getDeviceReverseId(device: { localIdentifier?: string | null; id: string }) {
  const truncatedId = device.id.length >= 32 ? device.id.slice(0, 32) : device.id;
  return device.localIdentifier?.trim() || truncatedId;
}

export function normalizeDeviceConnectionPolicy(
  connectionPolicy?: string | null,
  connectivityMode?: string | null,
): DeviceConnectionPolicy {
  if (isPolicy(connectionPolicy)) {
    return connectionPolicy;
  }

  if (connectivityMode === 'edge') {
    return 'edge_only';
  }

  if (connectivityMode === 'direct') {
    return 'direct_only';
  }

  return 'auto';
}

export function deriveLegacyConnectivityMode(
  connectionPolicy?: string | null,
  edgeConnectorId?: string | null,
): 'direct' | 'edge' {
  const normalized = normalizeDeviceConnectionPolicy(connectionPolicy);
  if (normalized === 'edge_only') {
    return 'edge';
  }

  if (normalized === 'auto' && edgeConnectorId) {
    return 'edge';
  }

  return 'direct';
}

export function getConnectionPolicyPresentation(policy: DeviceConnectionPolicy) {
  switch (policy) {
    case 'edge_only':
      return {
        label: 'Via Edge Local',
        hint: 'Usa somente o edge da unidade para conversar com o dispositivo.',
      };
    case 'direct_only':
      return {
        label: 'Direto / VPN',
        hint: 'A nuvem acessa o dispositivo diretamente por rota privada controlada.',
      };
    case 'cloud_autoreg_only':
      return {
        label: 'CGI Intelbras',
        hint: 'Usa somente o túnel AutoRegister CGI mantido pelo dispositivo Intelbras.',
      };
    case 'auto':
    default:
      return {
        label: 'Automático',
        hint: 'Escolhe a melhor rota disponível sem exigir ajuste manual por operação.',
      };
  }
}

function getEffectiveTransportLabel(transport: DeviceEffectiveTransport): string {
  switch (transport) {
    case 'edge_local':
      return 'Edge local';
    case 'direct_http':
      return 'Direto / VPN';
    case 'cloud_autoreg':
      return 'CGI AutoRegister';
    default:
      return 'Indisponível';
  }
}

export function resolveDeviceTransport(
  device: DeviceTransportInput,
  options?: { autoRegisterConnected?: boolean },
): DeviceTransportResolution {
  const connectionPolicy = normalizeDeviceConnectionPolicy(device.connectionPolicy, device.connectivityMode);
  const policyPresentation = getConnectionPolicyPresentation(connectionPolicy);
  const reverseId = getDeviceReverseId(device);
  const autoRegisterConnected = options?.autoRegisterConnected
    ?? IntelbrasAutoRegisterService.getInstance().hasDevice(reverseId);
  const directCapable = Boolean(device.passwordEnc);
  const edgeAssigned = Boolean(device.edgeConnectorId || device.edgeConnector?.id);
  const edgeName = device.edgeConnector?.name || null;

  if (connectionPolicy === 'edge_only') {
    return {
      connectionPolicy,
      connectionPolicyLabel: policyPresentation.label,
      connectionPolicyHint: policyPresentation.hint,
      connectivityMode: 'edge',
      effectiveTransport: edgeAssigned ? 'edge_local' : 'unavailable',
      effectiveTransportLabel: getEffectiveTransportLabel(edgeAssigned ? 'edge_local' : 'unavailable'),
      deliveryMode: edgeAssigned ? 'edge' : 'unavailable',
      reason: edgeAssigned
        ? `Dispositivo fixado para entrega via edge${edgeName ? ` ${edgeName}` : ''}.`
        : 'Política exige edge local, mas nenhum edge foi associado a este dispositivo.',
      autoRegisterConnected,
      directCapable,
      edgeAssigned,
      edgeName,
    };
  }

  if (connectionPolicy === 'direct_only') {
    return {
      connectionPolicy,
      connectionPolicyLabel: policyPresentation.label,
      connectionPolicyHint: policyPresentation.hint,
      connectivityMode: 'direct',
      effectiveTransport: directCapable ? 'direct_http' : 'unavailable',
      effectiveTransportLabel: getEffectiveTransportLabel(directCapable ? 'direct_http' : 'unavailable'),
      deliveryMode: directCapable ? 'cloud' : 'unavailable',
      reason: directCapable
        ? 'Dispositivo configurado para comunicação direta pela nuvem.'
        : 'Política direta exige credencial local do dispositivo para operação pela nuvem.',
      autoRegisterConnected,
      directCapable,
      edgeAssigned,
      edgeName,
    };
  }

  if (connectionPolicy === 'cloud_autoreg_only') {
    return {
      connectionPolicy,
      connectionPolicyLabel: policyPresentation.label,
      connectionPolicyHint: policyPresentation.hint,
      connectivityMode: 'direct',
      effectiveTransport: autoRegisterConnected ? 'cloud_autoreg' : 'unavailable',
      effectiveTransportLabel: getEffectiveTransportLabel(autoRegisterConnected ? 'cloud_autoreg' : 'unavailable'),
      deliveryMode: autoRegisterConnected ? 'cloud' : 'unavailable',
      reason: autoRegisterConnected
        ? 'Túnel CGI AutoRegister ativo para este dispositivo.'
        : 'Aguardando sessão CGI AutoRegister ativa para permitir comunicação pela nuvem.',
      autoRegisterConnected,
      directCapable,
      edgeAssigned,
      edgeName,
    };
  }

  if (edgeAssigned) {
    return {
      connectionPolicy,
      connectionPolicyLabel: policyPresentation.label,
      connectionPolicyHint: policyPresentation.hint,
      connectivityMode: 'edge',
      effectiveTransport: 'edge_local',
      effectiveTransportLabel: getEffectiveTransportLabel('edge_local'),
      deliveryMode: 'edge',
      reason: `Modo automático priorizou o edge${edgeName ? ` ${edgeName}` : ' local'} associado ao dispositivo.`,
      autoRegisterConnected,
      directCapable,
      edgeAssigned,
      edgeName,
    };
  }

  if (autoRegisterConnected) {
    return {
      connectionPolicy,
      connectionPolicyLabel: policyPresentation.label,
      connectionPolicyHint: policyPresentation.hint,
      connectivityMode: 'direct',
      effectiveTransport: 'cloud_autoreg',
      effectiveTransportLabel: getEffectiveTransportLabel('cloud_autoreg'),
      deliveryMode: 'cloud',
      reason: 'Modo automático usou o túnel CGI AutoRegister disponível para este dispositivo.',
      autoRegisterConnected,
      directCapable,
      edgeAssigned,
      edgeName,
    };
  }

  if (directCapable) {
    return {
      connectionPolicy,
      connectionPolicyLabel: policyPresentation.label,
      connectionPolicyHint: policyPresentation.hint,
      connectivityMode: 'direct',
      effectiveTransport: 'direct_http',
      effectiveTransportLabel: getEffectiveTransportLabel('direct_http'),
      deliveryMode: 'cloud',
      reason: 'Modo automático caiu para comunicação direta usando as credenciais salvas.',
      autoRegisterConnected,
      directCapable,
      edgeAssigned,
      edgeName,
    };
  }

  return {
    connectionPolicy,
    connectionPolicyLabel: policyPresentation.label,
    connectionPolicyHint: policyPresentation.hint,
    connectivityMode: device.connectivityMode === 'edge' ? 'edge' : 'direct',
    effectiveTransport: 'unavailable',
    effectiveTransportLabel: getEffectiveTransportLabel('unavailable'),
    deliveryMode: 'unavailable',
    reason: 'Nenhuma rota disponível: associe um edge, configure credenciais diretas ou ative CGI AutoRegister.',
    autoRegisterConnected,
    directCapable,
    edgeAssigned,
    edgeName,
  };
}
