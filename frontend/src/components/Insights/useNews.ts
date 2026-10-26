import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchCompany, fetchMatches } from '../../api';
import { impactOf, interestsOf, relevanceFor } from '../../utils';
import type { Employee } from '../../types';

// Всё состояние ленты живёт здесь, потому что список новостей показывается в сайдбаре, а диалог в основной части.
export function useNews(employee?: Employee) {
    const [filter, setFilter] = useState('all');
    const [selId, setSelId] = useState<string | null>(null);

    const companyQuery = useQuery({
        queryKey: ['company', employee?.companyId],
        queryFn: () => fetchCompany(employee!.companyId),
        enabled: !!employee?.companyId,
        refetchInterval: (q) => (q.state.data?.status === 'DRAFT' ? 3000 : false),
    });
    const company = companyQuery.data;
    const ready = company?.status === 'READY';

    const matches = useQuery({
        queryKey: ['matches', company?.id],
        queryFn: () => fetchMatches(company!.id),
        enabled: ready,
        refetchInterval: 5000,
    });

    const interests = employee ? interestsOf(employee, company) : [];
    const interestsKey = interests.join('|');
    const list = useMemo(
        () =>
            (matches.data ?? [])
                .filter((x) => filter === 'all' || impactOf(x).cls === filter)
                .sort((x, y) => relevanceFor(y, interests) - relevanceFor(x, interests)),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [matches.data, filter, interestsKey],
    );

    const selected = list.find((x) => x.id === selId) ?? list[0];
    return {
        companies: companyQuery,
        company,
        ready,
        matches,
        interests,
        filter,
        setFilter,
        list,
        selId: selected?.id ?? null,
        setSelId,
        selected,
    };
}
export type News = ReturnType<typeof useNews>;
