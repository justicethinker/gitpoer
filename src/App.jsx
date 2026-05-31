import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import UpgradeModal from './components/shared/UpgradeModal';

// Pages
const LandingPage = lazy(() => import('./pages/LandingPage'));
const PricingPage = lazy(() => import('./pages/PricingPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const LogoutPage = lazy(() => import('./pages/LogoutPage'));
const CheckoutPage = lazy(() => import('./pages/CheckoutPage'));
const AppShell = lazy(() => import('./pages/AppShell'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const RepoOverview = lazy(() => import('./pages/RepoOverview'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'));
const TermsPage = lazy(() => import('./pages/TermsPage'));

// Tools
const PortfolioScore = lazy(() => import('./tools/PortfolioScore'));
const ReadmeGenerator = lazy(() => import('./tools/ReadmeGenerator'));
const ChangelogGenerator = lazy(() => import('./tools/ChangelogGenerator'));
const OnboardingDoc = lazy(() => import('./tools/OnboardingDoc'));
const PRAutopilot = lazy(() => import('./tools/PRAutopilot'));
const RepoAudit = lazy(() => import('./tools/RepoAudit'));
const QuickInstall = lazy(() => import('./tools/QuickInstall'));
const MultiLanguage = lazy(() => import('./tools/MultiLanguage'));
const DocValidator = lazy(() => import('./tools/DocValidator'));
const IssueTemplates = lazy(() => import('./tools/IssueTemplates'));

const Loader = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#020617' }}>
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>ðŸŽ“</div>
      <div style={{ fontFamily: "'JetBrains Mono',monospace", color: '#3b82f6', fontSize: 13, letterSpacing: '.04em' }}>
        Loading GitGrade...
      </div>
    </div>
  </div>
);

export default function App() {
  return (
    <AppProvider>
      <Suspense fallback={<Loader />}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/logout" element={<LogoutPage />} />
          <Route path="/checkout/:plan" element={<CheckoutPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          
          <Route path="/app" element={<AppShell />}>
            <Route index element={<Dashboard />} />
            <Route path="repo/:owner/:repo" element={<RepoOverview />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="settings" element={<SettingsPage />} />
            
            <Route path="repo/:owner/:repo/score"      element={<PortfolioScore />} />
            <Route path="repo/:owner/:repo/readme"     element={<ReadmeGenerator />} />
            <Route path="repo/:owner/:repo/changelog"  element={<ChangelogGenerator />} />
            <Route path="repo/:owner/:repo/onboarding" element={<OnboardingDoc />} />
            <Route path="repo/:owner/:repo/pr"         element={<PRAutopilot />} />
            <Route path="repo/:owner/:repo/audit"      element={<RepoAudit />} />
            <Route path="repo/:owner/:repo/install"    element={<QuickInstall />} />
            <Route path="repo/:owner/:repo/translate"  element={<MultiLanguage />} />
            <Route path="repo/:owner/:repo/validator"  element={<DocValidator />} />
            <Route path="repo/:owner/:repo/issues"     element={<IssueTemplates />} />
          </Route>
          
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <UpgradeModal />
      </Suspense>
    </AppProvider>
  );
}
