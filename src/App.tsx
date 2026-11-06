import React, { useState } from 'react';
import { Entry } from './types/index.ts';
import { Header } from './components/Header.tsx';
import { ImportWizard } from './components/importer/ImportWizard.tsx';
import { VerificationLogicView } from './components/verification/VerificationLogicView.tsx';
import { MobilizerDashboard } from './components/mobilizer/MobilizerDashboard.tsx';
import { AdminDashboard } from './components/admin/AdminDashboard.tsx';
import { AnalyticsDashboard } from './components/analytics/AnalyticsDashboard.tsx';
import { 
} from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'importer_wizard' | 'verification_logic' | 'mobilizer_capture' | 'admin_panel' | 'analytics_dashboard'>('analytics_dashboard');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [isSimulatedOffline, setIsSimulatedOffline] = useState(false);

  const handleAddEntry = (newEntry: Entry) => {
    setEntries(prev => [newEntry, ...prev]);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Platform Navigation Header */}
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Dynamic View based on Active Tab */}
        {activeTab === 'importer_wizard' && <ImportWizard />}
        {activeTab === 'verification_logic' && <VerificationLogicView />}
        {activeTab === 'mobilizer_capture' && (
          <MobilizerDashboard
            entries={entries}
            onAddEntry={handleAddEntry}
            isSimulatedOffline={isSimulatedOffline}
            onToggleSimulatedOffline={() => setIsSimulatedOffline(!isSimulatedOffline)}
          />
        )}
        {activeTab === 'admin_panel' && <AdminDashboard />}
        {activeTab === 'analytics_dashboard' && <AnalyticsDashboard entries={entries} />}
      </main>
    </div>
  );
}
