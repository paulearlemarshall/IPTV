import { useMemo } from 'react';

export function useFilteredStreams({ streams, searchQuery, englishOnly, yearFilter, sortByYear, displayCount }) {
  const { visibleStreams, totalFilteredCount } = useMemo(() => {
    let filtered = streams;
    const lowerQuery = searchQuery.toLowerCase();

    if (searchQuery) {
        filtered = filtered.filter(s =>
            (s.name || s.title || "").toLowerCase().includes(lowerQuery)
        );
    }

    if (englishOnly) {
        const forbidden = ["SWEDEN", "NORWAY", "DENMARK", "FINLAND", "DEUTSCH", "FRENCH", "ITALIAN", "SPANISH"];
        filtered = filtered.filter(s => !forbidden.some(word => (s.name || s.title)?.toUpperCase().includes(word)));
    }

    if (yearFilter !== 'none') {
        filtered = filtered.filter(s => {
            const title = s.name || s.title || "";
            return title.includes(`(${yearFilter})`);
        });
    }

    if (sortByYear) {
        const extractYear = (stream) => {
            const title = stream.name || stream.title || "";
            const yearMatch = title.match(/\((\d{4})\)/);
            return yearMatch ? parseInt(yearMatch[1]) : null;
        };

        const withYears = filtered.filter(s => extractYear(s) !== null);
        const withoutYears = filtered.filter(s => extractYear(s) === null);

        withYears.sort((a, b) => {
            const yearA = extractYear(a);
            const yearB = extractYear(b);
            return yearB - yearA;
        });

        withoutYears.sort((a, b) => {
            const nameA = (a.name || a.title || "").toLowerCase();
            const nameB = (b.name || b.title || "").toLowerCase();
            return nameA.localeCompare(nameB);
        });

        filtered = [...withYears, ...withoutYears];
    }

    const totalCount = filtered.length;

    return {
      visibleStreams: filtered.slice(0, displayCount),
      totalFilteredCount: totalCount
    };
  }, [streams, englishOnly, searchQuery, yearFilter, sortByYear, displayCount]);

  return { visibleStreams, totalFilteredCount };
}
