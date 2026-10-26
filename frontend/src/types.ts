// Зеркало Prisma-схемы бэка. DateTime приходит в JSON строкой ISO, поэтому string.
// Если меняешь здесь, меняй и schema.prisma (и наоборот).
export type ProfileStatus = 'DRAFT' | 'READY';

// profileJson: Json на бэке, форму заполняет LLM. Поля ниже предположительны (из комментария в схеме).
export interface CompanyProfile {
    summary?: string;
    industry?: string;
    financing?: string;
    bank?: {
        okved?: string | null;
        okvedCode?: string | null;
        region?: string | null;
        products?: string[];
    };
    suppliers?: string[];
    competitors?: string[];
    risks?: string[];
    [key: string]: unknown;
}

export interface Company {
    id: string;
    inn: string | null;
    name: string;
    description: string | null;
    okved: string | null;
    region: string | null;
    keywords: string[];
    profileJson: CompanyProfile | null;
    status: ProfileStatus;
    createdAt: string;
    updatedAt: string;
    bankClientId?: string | null;
}

export interface CompanyInput {
    name: string;
    description?: string;
    inn?: string;
    bankClientId?: string;
}

export interface RawArticle {
    id: string;
    guid: string;
    title: string;
    link: string;
    description: string | null;
    fullText?: string | null;
    category: string | null;
    pubDate: string;
    processed?: boolean;
    sendToStream?: boolean;
    createdAt?: string;
}

// Ответ API ожидается как ArticleMatch + вложенный rawArticle (include в Prisma)
export interface ArticleMatch {
    id: string;
    rawArticleId: string;
    companyId: string;
    category: string | null;
    score: number; // надо будет уточнить
    summary: string | null;
    explanation: string | null;
    impact: string | null; //  не зафиксировано, стерпит
    horizon: string | null;
    createdAt: string;
    rawArticle: RawArticle;
    actions?: string[];
    alfaView?: string | null;
    sources?:
        | { type: 'news' | 'alfa'; ref: string; url?: string; page?: number; quote?: string }[]
        | null;
    agentRun?: { steps: unknown; durationMs: number | null; model: string | null } | null;
}
export interface Employee {
    id: string;
    username: string;
    companyId: string;
    role: string | null;
    interests: string[];
}

// для моков, с бэком не нужен будет, буду хэш пароля отправлять
export interface EmployeeCredentials extends Employee {
    password: string;
}

export interface ServerMessage {
    id: string;
    chatId: string;
    content: string;
    role: 'USER' | 'AI';
    status: 'PENDING' | 'DONE' | 'FAILED';
    createdAt: string;
    trace?: { steps?: unknown; durationMs?: number; model?: string | null } | null;
}
