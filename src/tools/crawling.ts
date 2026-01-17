import { z } from "zod";
import axios from "axios";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { API_CONFIG } from "./config.js";
import { createRequestLogger } from "../utils/logger.js";
import { checkpoint } from "agnost";
import { getLicenseService } from "../services/license-service.js";
import { licensedFetchText } from "../services/licensed-fetcher.js";
import { buildUsageLicense, getLicenseOptions, logUsageFromContent } from "../services/license-utils.js";
import type { LicensedFetchResult } from "../types.js";

export function registerCrawlingTool(server: McpServer, config?: { exaApiKey?: string }): void {
  server.tool(
    "crawling_exa",
    "Extract and crawl content from specific URLs using Exa AI - retrieves full text content, metadata, and structured information from web pages. Ideal for extracting detailed content from known URLs.",
    {
      url: z.string().describe("URL to crawl and extract content from"),
      maxCharacters: z.number().optional().describe("Maximum characters to extract (default: 3000)"),
      fetch: z.boolean().optional().describe("If true: fetch the URL directly with x402 support and log usage from fetched content"),
      include_licenses: z.boolean().optional().describe("Include license metadata in the response payload"),
      stage: z.enum(["infer", "embed", "tune", "train"]).optional().describe("License stage for usage logging and x402 acquisition"),
      distribution: z.enum(["private", "public"]).optional().describe("License distribution for usage logging and x402 acquisition"),
      estimated_tokens: z.number().optional().describe("Token estimate used for license acquisition when a 402 paywall is encountered"),
      max_chars: z.number().optional().describe("Max chars to return per fetched document when fetch=true"),
      payment_method: z.enum(["account_balance", "x402"]).optional().describe("Preferred payment rail when an x402 offer is encountered")
    },
    async ({ url, maxCharacters, fetch, include_licenses, stage, distribution, estimated_tokens, max_chars, payment_method }) => {
      const requestId = `crawling_exa-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const logger = createRequestLogger(requestId, 'crawling_exa');
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
      
      logger.start(url);
      
      try {
        // Create a fresh axios instance for each request
        const axiosInstance = axios.create({
          baseURL: API_CONFIG.BASE_URL,
          headers: {
            'accept': 'application/json',
            'content-type': 'application/json',
            'x-api-key': config?.exaApiKey || process.env.EXA_API_KEY || '',
            'x-exa-integration': 'crawling-mcp'
          },
          timeout: 25000
        });

        const crawlRequest = {
          ids: [url],
          contents: {
            text: {
              maxCharacters: maxCharacters || API_CONFIG.DEFAULT_MAX_CHARACTERS
            },
            livecrawl: 'preferred'
          }
        };
        
        checkpoint('crawl_request_prepared');
        logger.log("Sending crawl request to Exa API");
        
        const response = await axiosInstance.post(
          '/contents',
          crawlRequest,
          { timeout: 25000 }
        );
        
        checkpoint('crawl_response_received');
        logger.log("Received response from Exa API");

        if (!response.data || !response.data.results) {
          logger.log("Warning: Empty or invalid response from Exa API");
          checkpoint('crawl_complete');
          return {
            content: [{
              type: "text" as const,
              text: "No content found for the provided URL."
            }]
          };
        }

        logger.log(`Successfully crawled content from URL`);

        const results = response.data.results || [];
        const urls = results.map((r: any) => r.url).filter(Boolean);
        const licenses = await licenseService.checkLicenseBatch(urls);
        const fetchedByUrl: Record<string, LicensedFetchResult> = {};

        if (licenseOpts.fetch) {
          for (const resultItem of results) {
            const targetUrl = resultItem.url || url;
            const fetched = await licensedFetchText(targetUrl, {
              ledger: licenseService,
              stage: licenseOpts.stage,
              distribution: licenseOpts.distribution,
              estimatedTokens: licenseOpts.estimatedTokens,
              maxChars: licenseOpts.maxChars,
              paymentMethod: licenseOpts.paymentMethod
            });
            fetchedByUrl[targetUrl] = fetched;

            if (fetched.content_text && fetched.status >= 200 && fetched.status < 300) {
              const usageLicense = buildUsageLicense(targetUrl, licenses.get(targetUrl), fetched);
              await logUsageFromContent(licenseService, targetUrl, fetched.content_text, usageLicense, licenseOpts.stage, licenseOpts.distribution);
            }
          }
        } else {
          for (const resultItem of results) {
            const targetUrl = resultItem.url || url;
            const license = licenses.get(targetUrl);
            if (license) {
              await logUsageFromContent(
                licenseService,
                targetUrl,
                resultItem.text || "",
                license,
                licenseOpts.stage,
                licenseOpts.distribution
              );
            }
          }
        }

        let payload = response.data as any;
        if (licenseOpts.includeLicenses || licenseOpts.fetch) {
          payload = {
            ...response.data,
            licenses: results.map((r: any) => {
              const targetUrl = r.url || url;
              const fetched = fetchedByUrl[targetUrl];
              const content = fetched?.content_text || r.text || "";
              return {
                url: targetUrl,
                tokens: licenseService.estimateTokens(content),
                license: licenses.get(targetUrl),
                fetched: licenseOpts.fetch ? fetched : undefined
              };
            }),
            usage_log: licenseService.getSessionSummary()
          };
        }

        const result = {
          content: [{
            type: "text" as const,
            text: JSON.stringify(payload, null, 2)
          }]
        };
        
        checkpoint('crawl_complete');
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
              text: `Crawling error (${statusCode}): ${errorMessage}`
            }],
            isError: true,
          };
        }
        
        // Handle generic errors
        return {
          content: [{
            type: "text" as const,
            text: `Crawling error: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true,
        };
      }
    }
  );
}  
