export type SiteType = "greenhouse" | "lever" | "workday" | "generic" | "unknown";

export interface JobData {
  id?: string;
  sourceSite?: SiteType;
  jobUrl: string;
  canonicalUrl?: string;
  company?: string;
  role?: string;
  location?: string;
  team?: string;
  rawText: string;
  rawTitle: string;
  parsedAt?: string;
  parserVersion?: string;
}

export interface MiniMaxSettings {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  systemPrompt?: string;
  anthropicVersion?: string;
}

export interface ExtensionSettings {
  apiBaseUrl: string;
  requestTimeoutMs: number;
  autoParseOnExtract: boolean;
  aiCustomInstructions?: string;
  provider?: string;
  model?: string;
  apiKey?: string;
  providers?: {
    openai?: MiniMaxSettings;
    deepseek?: MiniMaxSettings;
    minimax?: MiniMaxSettings;
    ollama?: MiniMaxSettings;
    [provider: string]: MiniMaxSettings | undefined;
  };
}

export interface GenerateResumeRequest {
  jobData: JobData;
  profile?: Profile;
  masterResume?: MasterResume;
  settings?: Partial<ExtensionSettings>;
}

export interface GenerateResumeResponse {
  ok: boolean;
  message?: string;
  resumeJson?: unknown;
  tailoredResumeDraft?: unknown;
  error?: string;
  code?: string;
  provider?: string;
  model?: string;
  requestUrl?: string;
  requestPrompt?: string;
  requestPayloadPreview?: string;
  rawResponse?: string;
  responsePreview?: string;
  status?: number;
  statusText?: string;
  jsonPath?: string;
  htmlPath?: string;
  pdfPath?: string;
  jobTargetSource?: string;
  candidateSource?: string;
  artifactStage?: string;
  mocked?: boolean;
}

export interface Profile {
  id?: string;
  fullName: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  github: string;
  portfolio: string;
  website?: string;
  workAuthorization: string;
  requiresSponsorship: boolean;
  preferredRoles?: string[];
  preferredLocations?: string[];
  remotePreference?: string;
  salaryExpectation?: string;
  yearsOfExperience?: number;
  headline?: string;
  relocationPreference?: string;
}

export interface MasterResumeSummary {
  id: string;
  label: string;
  text: string;
  targetRoles?: string[];
  isDefault?: boolean;
}

export interface MasterResumeExperience {
  id: string;
  company: string;
  title: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  bullets?: Array<{ id?: string; text: string }>;
}

export interface MasterResumeProject {
  id: string;
  name: string;
  role?: string;
  startDate?: string;
  endDate?: string;
  bullets?: Array<{ id?: string; text: string }>;
}

export interface MasterResume {
  lastUpdated?: string;
  summaries: MasterResumeSummary[];
  experiences: MasterResumeExperience[];
  projects: MasterResumeProject[];
  education?: unknown[];
  skills: {
    languages: string[];
    frameworks: string[];
    libraries?: string[];
    tools: string[];
    cloud?: string[];
    databases?: string[];
    dataMl?: string[];
    other: string[];
  };
  certifications?: unknown[];
  awards?: unknown[];
  languagesSpoken?: unknown[];
  publications?: unknown[];
}

export interface AutofillAnswer {
  id: string;
  key: string;
  label: string;
  questionPatterns: string[];
  answer: string;
  source: string;
  confidence: string;
  askEveryTime: boolean;
  updatedAt: string;
}

export interface GeneratedResume {
  id: string;
  company: string;
  role: string;
  jobUrl: string;
  createdAt: string;
  resumeId?: string;
}

export interface ApplicationRecord {
  id: string;
  company: string;
  role: string;
  status: string;
  jobUrl: string;
  appliedAt: string;
  resumeId: string;
  notes: string;
}

export interface AppData {
  profile: Profile;
  masterResume: MasterResume;
  autofillAnswers: AutofillAnswer[];
  generatedResumes: GeneratedResume[];
  applications: ApplicationRecord[];
  settings: {
    defaultModel: string;
    defaultResumeStyle: string;
    autofillMode: string;
    simpleMode: boolean;
  };
}
