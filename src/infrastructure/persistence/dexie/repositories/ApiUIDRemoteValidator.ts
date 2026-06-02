import type { UIDRemoteValidator } from "#/core/interfaces/UIDRemoteValidator";
import type { UIDCheckResult } from "#/core/interfaces/types";
import { API_BASE_URL, apiFetch } from "#/infrastructure/api/apiClient";

export class ApiUIDRemoteValidator implements UIDRemoteValidator {
  async checkUIDExists(normalizedUID: string): Promise<UIDCheckResult> {
    const response = await apiFetch(`${API_BASE_URL}/api/cards/check-uid?uid=${normalizedUID}`);
    const data = await response.json();
    return { exists: data.exists, tenantId: data.tenantId };
  }
}
