// Exa API Types
export interface ExaSearchRequest {
  query: string;
  type: 'auto' | 'fast' | 'deep';
  category?: string;
  includeDomains?: string[];
  excludeDomains?: string[];
  startPublishedDate?: string;
  endPublishedDate?: string;
  numResults?: number;
  additionalQueries?: string[];
  contents: {
    text?: {
      maxCharacters?: number;
    } | boolean;
    context?: {
      maxCharacters?: number;
    } | boolean;
    summary?: {
      query?: string;
    } | boolean;
    livecrawl?: 'fallback' | 'preferred';
    subpages?: number;
    subpageTarget?: string[];
  };
}

export interface ExaCrawlRequest {
  ids: string[];
  text: boolean;
  livecrawl?: 'always' | 'fallback' | 'preferred';
}

export interface ExaSearchResult {
  id: string;
  title: string;
  url: string;
  publishedDate: string;
  author: string;
  text: string;
  summary?: string;
  image?: string;
  favicon?: string;
  score?: number;
}

export interface ExaSearchResponse {
  requestId: string;
  autopromptString?: string;
  resolvedSearchType: string;
  context?: string;
  results: ExaSearchResult[];
}

// Tool Types
export interface SearchArgs {
  query: string;
  numResults?: number;
  livecrawl?: 'fallback' | 'preferred';
  type?: 'auto' | 'fast' | 'deep';
}

// Deep Research API Types
export interface DeepResearchRequest {
  model: 'exa-research' | 'exa-research-pro';
  instructions: string;
  output?: {
    inferSchema?: boolean;
  };
}

export interface DeepResearchStartResponse {
  id: string;
  outputSchema?: {
    type: string;
    properties: any;
    required: string[];
    additionalProperties: boolean;
  };
}

export interface DeepResearchCheckResponse {
  id: string;
  createdAt: number;
  status: 'running' | 'completed' | 'failed';
  instructions: string;
  schema?: {
    type: string;
    properties: any;
    required: string[];
    additionalProperties: boolean;
  };
  data?: {
    report?: string;
    [key: string]: any;
  };
  operations?: Array<{
    type: string;
    stepId: string;
    text?: string;
    query?: string;
    goal?: string;
    results?: any[];
    url?: string;
    thought?: string;
    data?: any;
  }>;
  citations?: {
    [key: string]: Array<{
      id: string;
      url: string;
      title: string;
      snippet: string;
    }>;
  };
  timeMs?: number;
  model?: string;
  costDollars?: {
    total: number;
    research: {
      searches: number;
      pages: number;
      reasoningTokens: number;
    };
  };
}

export interface DeepResearchErrorResponse {
  response: {
    message: string;
    error: string;
    statusCode: number;
  };
  status: number;
  options: any;
  message: string;
  name: string;
}

// Exa Code API Types
export interface ExaCodeRequest {
  query: string;
  tokensNum: number;
  flags?: string[];
}

export interface ExaCodeResult {
  id: string;
  title: string;
  url: string;
  text: string;
  score?: number;
}

export interface ExaCodeResponse {
  requestId: string;
  query: string;
  repository?: string;
  response: string;
  resultsCount: number;
  costDollars: string;
  searchTime: number;
  outputTokens?: number;
  traces?: any;
}

export type LicenseStage = 'infer' | 'embed' | 'tune' | 'train';
export type Distribution = 'private' | 'public';

export interface LicenseInfo {
  url: string;
  license_found: boolean;
  action: 'allow' | 'deny' | 'unknown';
  distribution?: 'private' | 'public';
  price?: number;
  payto?: string;
  license_version_id?: number;
  license_sig?: string;
  license_type?: string;
  error?: string;
}

export interface UsageLogEntry {
  url: string;
  tokens: number;
  license_version_id?: number;
  license_sig?: string;
  stage: LicenseStage;
  distribution: Distribution;
  timestamp: string;
}

export interface LedgerAcquireResponse {
  licensed_url: string;
  license_version_id: number;
  license_sig: string;
  expires_at: string;
  cost: number;
  currency: string;
  stage: LicenseStage;
  distribution: Distribution;
  estimated_tokens: number;
  license_status: string;
  rate_per_1k_tokens: number;
}

export interface LicensedFetchResult {
  requested_url: string;
  final_url: string;
  status: number;
  content_type?: string | null;
  content_text?: string;
  payment_attempted: boolean;
  payment_required: boolean;
  x402?: {
    price?: string | null;
    payto?: string | null;
    stage?: string | null;
    distribution?: string | null;
    facilitator_url?: string | null;
  };
  acquire?: {
    licensed_url: string;
    cost: number;
    currency: string;
    expires_at: string;
    license_version_id: number;
    license_sig: string;
  };
  error?: string;
}

export interface LicenseTrackingSummary {
  total_urls: number;
  licensed_content: number;
  unlicensed_content: number;
  denied_content: number;
  total_tokens: number;
  tracking_enabled: boolean;
  errors: number;
}

export interface LicenseServiceConfig {
  apiUrl: string;
  apiKey?: string;
  licenseCheckTimeout: number;
  licenseAcquireTimeout: number;
  usageLogTimeout: number;
  enableTracking: boolean;
  enableCache: boolean;
  cacheTTL: number;
}
