import { useState } from 'react';

export function useSearchState() {
  const [searchQuery, setSearchQuery] = useState('');
  const [englishOnly, setEnglishOnly] = useState(true);
  const [yearFilter, setYearFilter] = useState('none');
  const [sortByYear, setSortByYear] = useState(false);

  return {
    searchQuery, setSearchQuery,
    englishOnly, setEnglishOnly,
    yearFilter, setYearFilter,
    sortByYear, setSortByYear
  };
}
