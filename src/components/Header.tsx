import React from 'react';

type AppTab = 'importer_wizard' | 'verification_logic' | 'mobilizer_capture' | 'admin_panel' | 'analytics_dashboard';

interface HeaderProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
}

const tabs: { id: AppTab; label: string }[] = [
  { id: 'analytics_dashboard', label: 'Dashboard' },
  { id: 'importer_wizard', label: 'Import' },
  { id: 'verification_logic', label: 'Verification' },
  { id: 'mobilizer_capture', label: 'Field' },
  { id: 'admin_panel', label: 'Admin' },
];

export const Header: React.FC<HeaderProps> = ({ activeTab, onTabChange }) => (
  <header className="sticky top-0 z-40 bg-white border-b border-gray-200">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between py-3 gap-3">
        <h1 className="text-base sm:text-lg font-bold text-gray-900">Lurambi Field Platform</h1>
      </div>
      <nav aria-label="Main navigation" className="flex gap-1 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            aria-current={activeTab === tab.id ? 'page' : undefined}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
              activeTab === tab.id ? 'border-emerald-700 text-emerald-800' : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  </header>
);
