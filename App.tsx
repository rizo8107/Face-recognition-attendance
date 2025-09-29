
import React, { useState } from 'react';
import EnrollmentView from './components/EnrollmentView';
import AttendanceView from './components/AttendanceView';
import DashboardView from './components/DashboardView';
import { UserPlusIcon, CheckInIcon } from './components/common/Icons';

type ViewMode = 'attendance' | 'enrollment' | 'dashboard';

const App: React.FC = () => {
  const [view, setView] = useState<ViewMode>('attendance');

  const navButtonClasses = "flex items-center gap-3 px-6 py-3 text-lg font-semibold rounded-t-lg transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white";
  const activeClasses = "bg-white text-sky-600 border-b-0";
  const inactiveClasses = "text-slate-500 hover:bg-slate-50";

  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col items-center p-4 sm:p-6 md:p-8">
      <header className="w-full max-w-5xl text-center mb-6 sm:mb-8">
        <h1 className="text-3xl sm:text-5xl font-bold tracking-tight">
          Face Attendance <span className="text-sky-600">System</span>
        </h1>
        <p className="text-slate-500 mt-1 sm:mt-2 text-base sm:text-lg">
          Privacy‑First Facial Recognition Kiosk
        </p>
      </header>
      
      <main className="w-full max-w-5xl flex flex-col">
        <div className="flex border-b border-slate-200 bg-slate-50 rounded-t-lg" role="tablist" aria-label="Main navigation">
          <button
            onClick={() => setView('attendance')}
            className={`${navButtonClasses} ${view === 'attendance' ? activeClasses : inactiveClasses}`}
            aria-selected={view === 'attendance'} role="tab" aria-label="Mark Attendance"
          >
            <CheckInIcon className="w-6 h-6" />
            <span className="hidden sm:inline">Mark Attendance</span>
          </button>
          <button
            onClick={() => setView('enrollment')}
            className={`${navButtonClasses} ${view === 'enrollment' ? activeClasses : inactiveClasses}`}
            aria-selected={view === 'enrollment'} role="tab" aria-label="Enroll New User"
          >
            <UserPlusIcon className="w-6 h-6" />
            <span className="hidden sm:inline">Enroll New User</span>
          </button>
          <button
            onClick={() => setView('dashboard')}
            className={`${navButtonClasses} ${view === 'dashboard' ? activeClasses : inactiveClasses}`}
            aria-selected={view === 'dashboard'} role="tab" aria-label="Dashboard"
          >
            <span className="text-lg" aria-hidden>📊</span>
            <span className="hidden sm:inline">Dashboard</span>
          </button>
        </div>
        
        <div className="bg-white p-6 sm:p-8 rounded-b-lg border border-slate-200 shadow-sm flex-grow">
          {view === 'attendance' && <AttendanceView />}
          {view === 'enrollment' && <EnrollmentView />}
          {view === 'dashboard' && <DashboardView />}
        </div>
      </main>

       <footer className="w-full max-w-5xl text-center mt-8 text-slate-500 text-sm">
          <p>&copy; {new Date().getFullYear()} Secure Systems Inc.</p>
          <p className="mt-1">This system uses on‑device embeddings for recognition. Your privacy is protected.</p>
        </footer>
    </div>
  );
};

export default App;
