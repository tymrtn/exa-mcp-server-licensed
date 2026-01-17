import type { Distribution, LicenseStage, LicenseInfo, LicensedFetchResult } from "../types.js";
import { LicenseService } from "./license-service.js";

export function getLicenseOptions(args: any): {
  fetch: boolean;
  includeLicenses: boolean;
  stage: LicenseStage;
  distribution: Distribution;
  estimatedTokens: number;
  maxChars: number;
  paymentMethod: "account_balance" | "x402";
} {
  return {
    fetch: Boolean(args.fetch ?? false),
    includeLicenses: Boolean(args.include_licenses ?? false),
    stage: (args.stage ?? "infer") as LicenseStage,
    distribution: (args.distribution ?? "private") as Distribution,
    estimatedTokens: Number(args.estimated_tokens ?? 1500),
    maxChars: Number(args.max_chars ?? 200000),
    paymentMethod: (args.payment_method ?? "account_balance") as "account_balance" | "x402",
  };
}

export function buildUsageLicense(
  url: string,
  license?: LicenseInfo,
  fetched?: LicensedFetchResult
): LicenseInfo | undefined {
  if (license?.license_version_id) return license;
  if (fetched?.acquire?.license_version_id) {
    return {
      url,
      license_found: true,
      action: "allow",
      license_version_id: fetched.acquire.license_version_id,
      license_sig: fetched.acquire.license_sig,
      license_type: "x402",
    };
  }
  return license;
}

export function getUnavailableReason(
  license?: LicenseInfo,
  fetched?: LicensedFetchResult
): string | null {
  if (license?.action === "deny") return "license denied";
  if (fetched?.status === 401 || fetched?.status === 403) {
    return `blocked (${fetched.status})`;
  }
  if (fetched?.status === 402) return "payment required";
  return null;
}

export async function logUsageFromContent(
  licenseService: LicenseService,
  url: string,
  content: string,
  license: LicenseInfo | undefined,
  stage: LicenseStage,
  distribution: Distribution
): Promise<void> {
  if (!license || license.action === "deny") return;
  const tokens = licenseService.estimateTokens(content);
  if (tokens === 0) return;
  await licenseService.logUsage(url, tokens, license, stage, distribution);
}
