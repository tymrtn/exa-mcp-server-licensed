import { z } from "zod";
import axios from "axios";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { API_CONFIG } from "./config.js";
import { ExaSearchRequest, ExaSearchResponse, LicensedFetchResult } from "../types.js";
import { createRequestLogger } from "../utils/logger.js";
import { checkpoint } from "agnost"
import { getLicenseService } from "../services/license-service.js";
import { licensedFetchText } from "../services/licensed-fetcher.js";
import { buildUsageLicense, getLicenseOptions, getUnavailableReason, logUsageFromContent } from "../services/license-utils.js";

export function registerWebSearchTool(server: McpServer, config?: { exaApiKey?: string }): void {
  server.tool(
    "web_search_exa",
    "Search the web using Exa AI - performs real-time web searches and can scrape content from specific URLs. Supports configurable result counts and returns the content from the most relevant websites.",
    {
      query: z.string().describe("Websearch query"),
      numResults: z.number().optional().describe("Number of search results to return (default: 8)"),
      livecrawl: z.enum(['fallback', 'preferred']).optional().describe("Live crawl mode - 'fallback': use live crawling as backup if cached content unavailable, 'preferred': prioritize live crawling (default: 'fallback')"),
      type: z.enum(['auto', 'fast', 'deep']).optional().describe("Search type - 'auto': balanced search (default), 'fast': quick results, 'deep': comprehensive search"),
      contextMaxCharacters: z.number().optional().describe("Maximum characters for context string optimized for LLMs (default: 10000)"),
      fetch: z.boolean().optional().describe("If true: fetch each result URL directly with x402 support and log usage from fetched content"),
      include_licenses: z.boolean().optional().describe("Include license metadata in the response payload"),
      stage: z.enum(["infer", "embed", "tune", "train"]).optional().describe("License stage for usage logging and x402 acquisition"),
      distribution: z.enum(["private", "public"]).optional().describe("License distribution for usage logging and x402 acquisition"),
      estimated_tokens: z.number().optional().describe("Token estimate used for license acquisition when a 402 paywall is encountered"),
      max_chars: z.number().optional().describe("Max chars to return per fetched document when fetch=true"),
      payment_method: z.enum(["account_balance", "x402"]).optional().describe("Preferred payment rail when an x402 offer is encountered")
    },
    {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true
    },
    async ({ query, numResults, livecrawl, type, contextMaxCharacters, fetch, include_licenses, stage, distribution, estimated_tokens, max_chars, payment_method }) => {
      const requestId = `web_search_exa-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const logger = createRequestLogger(requestId, 'web_search_exa');
      const licenseService = getLicenseService();
      const licenseOpts = getLicenseOptions({
        fetch,
        include_licenses,
        stage,
        distribution,
        estimated_tokens,
        max_chars,
        payment_method
      });
      
      logger.start(query);
      
      try {
        // Create a fresh axios instance for each request
        const axiosInstance = axios.create({
          baseURL: API_CONFIG.BASE_URL,
          headers: {
            'accept': 'application/json',
            'content-type': 'application/json',
            'x-api-key': config?.exaApiKey || process.env.EXA_API_KEY || '',
            'x-exa-integration': 'web-search-mcp'
          },
          timeout: 25000
        });

        const searchRequest: ExaSearchRequest = {
          query,
          type: type || "auto",
          numResults: numResults || API_CONFIG.DEFAULT_NUM_RESULTS,
          contents: {
            text: true,
            context: {
              maxCharacters: contextMaxCharacters || 10000
            },
            livecrawl: livecrawl || 'fallback'
          }
        };
        
        checkpoint('web_search_request_prepared');
        logger.log("Sending request to Exa API");
        
        const response = await axiosInstance.post<ExaSearchResponse>(
          API_CONFIG.ENDPOINTS.SEARCH,
          searchRequest,
          { timeout: 25000 }
        );
        
        checkpoint('exa_search_response_received');
        logger.log("Received response from Exa API");

        if (!response.data || !response.data.context) {
          logger.log("Warning: Empty or invalid response from Exa API");
          checkpoint('web_search_complete');
          return {
            content: [{
              type: "text" as const,
              text: "No search results found. Please try a different query."
            }]
          };
        }

        logger.log(`Context received with ${response.data.context.length} characters`);

        const results = response.data.results || [];
        const urls = results.map((r) => r.url).filter(Boolean);
        const licenses = await licenseService.checkLicenseBatch(urls);
        const fetchedByUrl: Record<string, LicensedFetchResult> = {};
        const blockedByUrl = new Map<string, string>();

        if (licenseOpts.fetch) {
          for (const url of urls) {
            const existingLicense = licenses.get(url);
            const preBlock = getUnavailableReason(existingLicense);
            if (preBlock) {
              blockedByUrl.set(url, preBlock);
              continue;
            }
            const fetched = await licensedFetchText(url, {
              ledger: licenseService,
              stage: licenseOpts.stage,
              distribution: licenseOpts.distribution,
              estimatedTokens: licenseOpts.estimatedTokens,
              maxChars: licenseOpts.maxChars,
              paymentMethod: licenseOpts.paymentMethod
            });
            fetchedByUrl[url] = fetched;

            const blocked = getUnavailableReason(licenses.get(url), fetched);
            if (blocked) {
              blockedByUrl.set(url, blocked);
              fetched.content_text = undefined;
            } else if (fetched.content_text && fetched.status >= 200 && fetched.status < 300) {
              const usageLicense = buildUsageLicense(url, licenses.get(url), fetched);
              await logUsageFromContent(licenseService, url, fetched.content_text, usageLicense, licenseOpts.stage, licenseOpts.distribution);
            }
          }
        } else {
          for (const resultItem of results) {
            const license = licenses.get(resultItem.url);
            const blocked = getUnavailableReason(license);
            if (blocked) {
              blockedByUrl.set(resultItem.url, blocked);
              continue;
            }
            if (license) {
              await logUsageFromContent(
                licenseService,
                resultItem.url,
                resultItem.text || "",
                license,
                licenseOpts.stage,
                licenseOpts.distribution
              );
            }
          }
        }

        const hasBlocked = blockedByUrl.size > 0;
        let payloadText = response.data.context;

        if (licenseOpts.includeLicenses || licenseOpts.fetch || hasBlocked) {
          const sanitizedResults = results.map((r) => {
            const blocked = blockedByUrl.get(r.url);
            if (!blocked) return r;
            return { ...r, text: "" };
          });
          const licenseDetails = results.map((r) => {
            const fetched = fetchedByUrl[r.url];
            const blocked = blockedByUrl.get(r.url);
            const content = blocked ? "" : (fetched?.content_text || r.text || "");
            return {
              url: r.url,
              title: r.title,
              unavailable: blocked || undefined,
              tokens: licenseService.estimateTokens(content),
              license: licenses.get(r.url),
              fetched: licenseOpts.fetch ? fetched : undefined
            };
          });

          payloadText = JSON.stringify({
            context: hasBlocked ? undefined : response.data.context,
            results: sanitizedResults,
            licenses: licenseDetails,
            usage_log: licenseService.getSessionSummary()
          }, null, 2);
        }

        const result = {
          content: [{
            type: "text" as const,
            text: payloadText
          }]
        };
        
        checkpoint('web_search_complete');
        logger.complete();
        return result;
      } catch (error) {
        logger.error(error);
        
        if (axios.isAxiosError(error)) {
          // Handle Axios errors specifically
          const statusCode = error.response?.status || 'unknown';
          const errorMessage = error.response?.data?.message || error.message;
          
          logger.log(`Axios error (${statusCode}): ${errorMessage}`);
          return {
            content: [{
              type: "text" as const,
              text: `Search error (${statusCode}): ${errorMessage}`
            }],
            isError: true,
          };
        }
        
        // Handle generic errors
        return {
          content: [{
            type: "text" as const,
            text: `Search error: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true,
        };
      }
    }
  );
}  
