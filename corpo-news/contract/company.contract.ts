export const companyStream = {
  name: 'COMPANY',
  subject: {
    core: ['company.>'],
  },
  consumers: {
    mlEnrich: 'company_enrich',
    nestEnriched: 'company_enriched',
  },
  filters: {
    enrich: 'company.enrich.>',
    enriched: 'company.enriched.>',
    ready: 'company.ready.>',
  },
};

export const subjectForEnrich = (id: string) => `company.enrich.${id}`;
export const subjectForEnriched = (id: string) => `company.enriched.${id}`;
export const subjectForReady = (id: string) => `company.ready.${id}`;

export interface CompanyEnrichEvent {
  companyId: string;
  name: string;
  description: string | null;
  inn: string | null;
  region: string | null;

  bankClientId: string | null;
}

export interface CompanyEnrichedEvent {
  companyId: string;
  keywords: string[];
  profileJson: unknown;
  enrichedAt: string;
}

export interface CompanyReadyEvent {
  companyId: string;
  name: string;
  description: string | null;
  region: string | null;
  keywords: string[];
  profileJson: unknown;
  updatedAt: string;

  bankClientId: string | null;
}
