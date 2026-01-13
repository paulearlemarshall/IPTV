import React from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';

const Sidebar = ({
  groupedCategories,
  expandedGroups,
  setExpandedGroups,
  selectedCategory,
  handleCategoryClick
}) => {
  return (
    <div className="sidebar">
      <div className="sidebar-header">Categories</div>
      <div className="sidebar-list">
        {Object.entries(groupedCategories).sort().map(([prefix, cats]) => (
            <div key={prefix}>
                <div className="group-header" onClick={() => setExpandedGroups(p => ({...p, [prefix]: !p[prefix]}))}>
                    {expandedGroups[prefix] ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {prefix}
                </div>
                {expandedGroups[prefix] && cats.map(cat => (
                    <div key={cat.category_id} className={`category-item ${selectedCategory === cat.category_id ? 'active' : ''}`} onClick={() => handleCategoryClick(cat.category_id)} style={{ paddingLeft: '32px' }}>
                        {cat.category_name}
                    </div>
                ))}
            </div>
        ))}
      </div>
    </div>
  );
};

export default Sidebar;
