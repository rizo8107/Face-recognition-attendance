
import React, { useState } from 'react';
import EnrollmentView from './components/EnrollmentView';
import AttendanceView from './components/AttendanceView';
import DashboardView from './components/DashboardView';
import { UserPlusIcon, CheckInIcon } from './components/common/Icons';

type ViewMode = 'attendance' | 'enrollment' | 'dashboard';

const App: React.FC = () => {
  const [view, setView] = useState<ViewMode>('attendance');

  const navButtonClasses = "flex items-center gap-3 px-6 py-3 text-lg font-semibold rounded-t-lg transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900";
  const activeClasses = "bg-gray-800 text-cyan-400";
  const inactiveClasses = "text-gray-400 hover:bg-gray-700 hover:text-white";

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col items-center p-4 sm:p-6 md:p-8">
      <header className="w-full max-w-4xl text-center mb-8">
        <h1 className="text-4xl sm:text-5xl font-bold text-white tracking-tight">
          Face Attendance <span className="text-cyan-400">System</span>
        </h1>
        <p className="text-gray-400 mt-2 text-lg">
          Privacy-First Facial Recognition Kiosk
        </p>
      </header>
      
      <main className="w-full max-w-4xl flex flex-col">
        <div className="flex border-b border-gray-700">
          <button
            onClick={() => setView('attendance')}
            className={`${navButtonClasses} ${view === 'attendance' ? activeClasses : inactiveClasses}`}
          >
            <CheckInIcon className="w-6 h-6" />
            Mark Attendance
          </button>
          <button
            onClick={() => setView('enrollment')}
            className={`${navButtonClasses} ${view === 'enrollment' ? activeClasses : inactiveClasses}`}
          >
            <UserPlusIcon className="w-6 h-6" />
            Enroll New User
          </button>
          <button
            onClick={() => setView('dashboard')}
            className={`${navButtonClasses} ${view === 'dashboard' ? activeClasses : inactiveClasses}`}
          >
            📊 Dashboard
          </button>
        </div>
        
        <div className="bg-gray-800 p-6 sm:p-8 rounded-b-lg shadow-2xl flex-grow">
          {view === 'attendance' && <AttendanceView />}
          {view === 'enrollment' && <EnrollmentView />}
          {view === 'dashboard' && <DashboardView />}
        </div>
      </main>

       <footer className="w-full max-w-4xl text-center mt-8 text-gray-500 text-sm">
          <p>&copy; {new Date().getFullYear()} Secure Systems Inc. All rights reserved.</p>
          <p className="mt-1">This system uses on-device embeddings for recognition. Your privacy is protected.</p>
        </footer>
    </div>
  );
};

export default App;
