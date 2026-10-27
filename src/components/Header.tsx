import React from 'react';
import { Shield, ShieldCheck, MapPin, Database, Award, CheckCircle2, Smartphone, BarChart3 } from 'lucide-react';
import { UserRole } from '../types/index.ts';

interface HeaderProps {
  currentRole: UserRole;
  onRoleChange: (role: UserRole) => void;
  activeTab: 'architecture' | 'supabase_sql' | 'importer_wizard' | 'verification_logic' | 'mobilizer_capture' | 'admin_panel' | 'analytics_dashboard' | 'hierarchy_seed' | 'documentation';
  onTabChange: (tab: 'architecture' | 'supabase_sql' | 'importer_wizard' | 'verification_logic' | 'mobilizer_capture' | 'admin_panel' | 'analytics_dashboard' | 'hierarchy_seed' | 'documentation') => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentRole,
  onRoleChange,
  activeTab,
  onTabChange
}) => {
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-emerald-900/10 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-3 gap-3">
          {/* Logo & Identity */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-700 via-emerald-800 to-teal-900 flex items-center justify-center text-white shadow-md shadow-emerald-900/10 font-bold text-lg">
              L27
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold text-gray-900 leading-tight">
                  Lurambi Campaign Field Platform
                </h1>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                  2027 MP Race
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500 font-medium">
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                  Kakamega County (Lurambi)
                </span>
                <span>•</span>
                <span className="text-emerald-700 font-semibold flex items-center gap-1">
                  <Shield className="w-3.5 h-3.5 text-emerald-600" />
                  KDPA 2019 Compliant
                </span>
              </div>
            </div>
          </div>

          {/* Role Switcher & Stage Badge */}
          <div className="flex items-center justify-between sm:justify-end gap-2">
            <div className="flex items-center bg-gray-100 rounded-lg p-1 text-xs font-medium text-gray-600">
              <span className="px-2 text-gray-400 font-semibold">Simulate Role:</span>
              <button
                onClick={() => onRoleChange('admin')}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  currentRole === 'admin'
                    ? 'bg-emerald-700 text-white shadow-xs font-semibold'
                    : 'hover:text-gray-900'
                }`}
              >
                Admin
              </button>
              <button
                onClick={() => onRoleChange('ward_coordinator')}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  currentRole === 'ward_coordinator'
                    ? 'bg-emerald-700 text-white shadow-xs font-semibold'
                    : 'hover:text-gray-900'
                }`}
              >
                Coordinator
              </button>
              <button
                onClick={() => onRoleChange('mobilizer')}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  currentRole === 'mobilizer'
                    ? 'bg-emerald-700 text-white shadow-xs font-semibold'
                    : 'hover:text-gray-900'
                }`}
              >
                Mobilizer
              </button>
            </div>

            <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>All 8 Stages Complete</span>
            </div>
          </div>
        </div>

        {/* Tab Navigation for All 8 Deliverable Stages */}
        <div className="flex items-center space-x-1 border-t border-gray-100 pt-1 -mb-px overflow-x-auto">
          <button
            onClick={() => onTabChange('architecture')}
            className={`py-2 px-3 text-xs sm:text-sm font-medium border-b-2 whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              activeTab === 'architecture'
                ? 'border-emerald-700 text-emerald-800 font-semibold'
                : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
            }`}
          >
            <Shield className="w-4 h-4" />
            Stage 1: Architecture
          </button>
          <button
            onClick={() => onTabChange('supabase_sql')}
            className={`py-2 px-3 text-xs sm:text-sm font-medium border-b-2 whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              activeTab === 'supabase_sql'
                ? 'border-emerald-700 text-emerald-800 font-semibold'
                : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
            }`}
          >
            <Database className="w-4 h-4" />
            Stage 2: Supabase SQL
          </button>
          <button
            onClick={() => onTabChange('importer_wizard')}
            className={`py-2 px-3 text-xs sm:text-sm font-medium border-b-2 whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              activeTab === 'importer_wizard'
                ? 'border-emerald-700 text-emerald-800 font-semibold'
                : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            Stage 3: Import Wizard
          </button>
          <button
            onClick={() => onTabChange('verification_logic')}
            className={`py-2 px-3 text-xs sm:text-sm font-medium border-b-2 whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              activeTab === 'verification_logic'
                ? 'border-emerald-700 text-emerald-800 font-semibold'
                : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
            }`}
          >
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            Stage 4: Duplicates & Verification
          </button>
          <button
            onClick={() => onTabChange('mobilizer_capture')}
            className={`py-2 px-3 text-xs sm:text-sm font-medium border-b-2 whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              activeTab === 'mobilizer_capture'
                ? 'border-emerald-700 text-emerald-800 font-semibold'
                : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
            }`}
          >
            <Smartphone className="w-4 h-4 text-emerald-600" />
            Stage 5: Field Capture & PWA
          </button>
          <button
            onClick={() => onTabChange('admin_panel')}
            className={`py-2 px-3 text-xs sm:text-sm font-medium border-b-2 whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              activeTab === 'admin_panel'
                ? 'border-emerald-700 text-emerald-800 font-semibold'
                : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
            }`}
          >
            <Shield className="w-4 h-4 text-emerald-600" />
            Stage 6: Admin & Flags
          </button>
          <button
            onClick={() => onTabChange('analytics_dashboard')}
            className={`py-2 px-3 text-xs sm:text-sm font-medium border-b-2 whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              activeTab === 'analytics_dashboard'
                ? 'border-emerald-700 text-emerald-800 font-semibold'
                : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
            }`}
          >
            <BarChart3 className="w-4 h-4 text-emerald-600" />
            Stage 7: Analytics & Reports
          </button>
          <button
            onClick={() => onTabChange('documentation')}
            className={`py-2 px-3 text-xs sm:text-sm font-medium border-b-2 whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              activeTab === 'documentation'
                ? 'border-emerald-700 text-emerald-800 font-semibold'
                : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
            }`}
          >
            <Award className="w-4 h-4 text-emerald-600" />
            Stage 8: Production Docs & KDPA
          </button>
          <button
            onClick={() => onTabChange('hierarchy_seed')}
            className={`py-2 px-3 text-xs sm:text-sm font-medium border-b-2 whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              activeTab === 'hierarchy_seed'
                ? 'border-emerald-700 text-emerald-800 font-semibold'
                : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
            }`}
          >
            <MapPin className="w-4 h-4" />
            6 Wards & Seeds
          </button>
        </div>
      </div>
    </header>
  );
};
