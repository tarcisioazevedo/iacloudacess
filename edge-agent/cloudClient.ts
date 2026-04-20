import axios, { AxiosInstance } from 'axios';
import type {
  CloudEdgeCredentials,
  CloudSyncJob,
  EdgeLicenseSnapshot,
  EdgeHeartbeatDeviceStatus,
  NormalizedEdgeEventPayload,
} from './types';

interface EnrollmentResponse {
  edge: {
    id: string;
    name: string;
    school?: { id: string };
    schoolUnit?: { id: string };
  };
  credentials: {
    edgeId: string;
    edgeKey: string;
  };
}

export class EdgeCloudClient {
  private readonly http: AxiosInstance;

  constructor(baseUrl: string, timeout: number) {
    this.http = axios.create({
      baseURL: baseUrl,
      timeout,
    });
  }

  async enroll(payload: {
    enrollmentToken: string;
    connectorName?: string;
    hostname?: string;
    version?: string;
    localSubnets?: string[];
    capabilities?: Record<string, unknown>;
    adoptDevices?: boolean;
  }): Promise<CloudEdgeCredentials> {
    const response = await this.http.post<EnrollmentResponse>('/api/edge/enroll', payload);
    return {
      edgeId: response.data.credentials.edgeId,
      edgeKey: response.data.credentials.edgeKey,
      connectorName: response.data.edge.name,
      schoolId: response.data.edge.school?.id,
      schoolUnitId: response.data.edge.schoolUnit?.id,
      enrolledAt: new Date().toISOString(),
    };
  }

  private authHeaders(credentials: CloudEdgeCredentials) {
    return {
      'x-edge-id': credentials.edgeId,
      'x-edge-key': credentials.edgeKey,
    };
  }

  async heartbeat(
    credentials: CloudEdgeCredentials,
    payload: {
      hostname?: string;
      version?: string;
      status: 'online' | 'degraded';
      localSubnets?: string[];
      devices: EdgeHeartbeatDeviceStatus[];
    },
  ) {
    await this.http.post('/api/edge/heartbeat', payload, {
      headers: this.authHeaders(credentials),
    });
  }

  async fetchSyncJobs(credentials: CloudEdgeCredentials, limit: number): Promise<CloudSyncJob[]> {
    const response = await this.http.get<{ jobs: CloudSyncJob[] }>('/api/edge/sync-jobs', {
      headers: this.authHeaders(credentials),
      params: { limit },
    });
    return response.data.jobs || [];
  }

  async acknowledgeSyncJob(
    credentials: CloudEdgeCredentials,
    jobId: string,
    success: boolean,
    error?: string,
  ) {
    await this.http.post(`/api/edge/sync-jobs/${jobId}/result`, {
      success,
      error,
    }, {
      headers: this.authHeaders(credentials),
    });
  }

  async sendEvents(credentials: CloudEdgeCredentials, events: NormalizedEdgeEventPayload[]) {
    await this.http.post('/api/edge/events', { events }, {
      headers: this.authHeaders(credentials),
    });
  }

  async fetchLicenseStatus(credentials: CloudEdgeCredentials): Promise<EdgeLicenseSnapshot> {
    const response = await this.http.get<EdgeLicenseSnapshot>('/api/edge/license', {
      headers: this.authHeaders(credentials),
    });
    return response.data;
  }
}
