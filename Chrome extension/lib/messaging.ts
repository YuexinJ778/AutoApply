import { MESSAGE_TYPES } from "./constants";
import type { GenerateResumeRequest, GenerateResumeResponse, JobData } from "./types";

export interface PopupExtractCurrentPageMessage {
  type: typeof MESSAGE_TYPES.EXTRACT_CURRENT_PAGE;
}

export interface PopupGenerateResumeMessage {
  type: typeof MESSAGE_TYPES.GENERATE_RESUME;
  payload: GenerateResumeRequest;
}

export type PopupToBackgroundMessage =
  | PopupExtractCurrentPageMessage
  | PopupGenerateResumeMessage;

export interface BackgroundToContentReadPageMessage {
  type: typeof MESSAGE_TYPES.READ_PAGE_CONTENT;
}

export interface ExtensionErrorResponse {
  ok: false;
  error: string;
  code?: string;
}

export interface ExtractCurrentPageSuccessData {
  pageSnapshot: unknown;
  jobPosting: JobData;
}

export interface ExtractCurrentPageSuccessResponse {
  ok: true;
  data: ExtractCurrentPageSuccessData;
}

export interface GenerateResumeSuccessResponse {
  ok: true;
  data: GenerateResumeResponse;
}

export type PopupToBackgroundResponse =
  | ExtensionErrorResponse
  | ExtractCurrentPageSuccessResponse
  | GenerateResumeSuccessResponse;

export function isPopupToBackgroundMessage(input: unknown): input is PopupToBackgroundMessage {
  if (!input || typeof input !== "object") {
    return false;
  }

  const value = input as { type?: string };

  return value.type === MESSAGE_TYPES.EXTRACT_CURRENT_PAGE || value.type === MESSAGE_TYPES.GENERATE_RESUME;
}
