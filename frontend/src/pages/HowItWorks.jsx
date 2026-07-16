import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  Bell,
  CheckCircle2,
  DownloadCloud,
  Download,
  Eye,
  FileCheck,
  FileSearch,
  Highlighter,
  KeyRound,
  Lock,
  MonitorCog,
  ShieldCheck,
  Settings2,
  Shield,
  Upload,
  Users,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import Header from '../components/Header';
import Footer from '../components/Footer';
import getDefaultRouteByRole from '../utils/getDefaultRouteByRole';

const HowItWorks = () => {
  const { isAuthenticated, user } = useAuth();
  const { t } = useLanguage();

  const overviewPoints = t('howItWorks.overviewPoints');
  const features = t('howItWorks.features').map((f, i) => ({
    ...f,
    icon: [Upload, FileCheck, FileSearch, Highlighter, Users, BarChart3, Settings2][i],
  }));
  const teamTasks = t('howItWorks.teamTasks');
  const reportSteps = t('howItWorks.reportSteps').map((step, i) => ({
    ...step,
    column: ['right', 'left', 'right', 'left', 'right', 'right'][i],
  }));
  const resultMeaning = t('howItWorks.resultMeaning').map((item, i) => ({
    ...item,
    icon: [Eye, CheckCircle2, Shield, Download][i],
  }));
  const annotatedPdfSteps = t('howItWorks.annotatedPdfSteps');
  const supportTips = t('howItWorks.supportTips');
  const accountSections = t('howItWorks.accountSections').map((item, i) => ({
    ...item,
    icon: [BarChart3, KeyRound, MonitorCog, DownloadCloud][i],
  }));
  const teamFeatureSections = t('howItWorks.teamFeatureSections').map((item, i) => ({
    ...item,
    icon: [CheckCircle2, Bell, Users][i],
  }));
  const adminFeatureSections = t('howItWorks.adminFeatureSections').map((item, i) => ({
    ...item,
    icon: [ShieldCheck, FileCheck, Users, Lock][i],
  }));

  const workspaceLink = user?.mustChangePassword
    ? '/change-password'
    : getDefaultRouteByRole(user?.role);

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      <a
        href="#how-it-works-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-indigo-700 focus:shadow"
      >
        {t('howItWorks.skipToContent')}
      </a>
      <Header />

      <main id="how-it-works-content" className="flex-1">
        <section aria-labelledby="how-it-works-heading" className="border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 lg:py-16">
            <div className="grid gap-10 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)] lg:items-start">
              <div className="max-w-3xl">
                <h1 id="how-it-works-heading" className="mt-6 text-4xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-5xl">
                  {t('howItWorks.title')}
                </h1>
                <p className="mt-4 text-lg text-gray-600 dark:text-gray-300">
                  {t('howItWorks.intro')}
                </p>
                <p className="mt-4 text-base text-gray-600 dark:text-gray-300">
                  {t('howItWorks.firstTimeInfo')}
                </p>

                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <Link
                    to={isAuthenticated ? workspaceLink : '/login'}
                    className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                  >
                    {isAuthenticated ? t('howItWorks.openWorkspace') : t('howItWorks.signInToStart')}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                  {!isAuthenticated && (
                    <Link
                      to="/login?admin=true"
                      className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-6 py-3 font-semibold text-gray-700 transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800 dark:focus-visible:ring-offset-gray-900"
                    >
                      {t('howItWorks.adminSignIn')}
                    </Link>
                  )}
                </div>
              </div>

              <aside className="mt-8 rounded-2xl border border-gray-200 bg-gray-50 p-6 shadow-sm dark:border-gray-800 dark:bg-gray-950 lg:mt-0">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('howItWorks.atAGlance')}</h2>
                <ul className="mt-4 space-y-4">
                  {overviewPoints.map((point) => (
                    <li key={point} className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-300">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-indigo-600 dark:text-indigo-300" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </aside>
            </div>
          </div>
        </section>

        <section id="features" aria-labelledby="features-heading" className="bg-white dark:bg-gray-900">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 lg:py-16">
            <div className="max-w-3xl">
              <h2 id="features-heading" className="text-3xl font-bold text-gray-900 dark:text-white">{t('howItWorks.mainFeatures')}</h2>
              <p className="mt-3 text-gray-600 dark:text-gray-300">
                {t('howItWorks.mainFeaturesDescription')}
              </p>
            </div>

            <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {features.map(({ title, description, icon: Icon }) => (
                <article
                  key={title}
                  className="rounded-2xl border border-gray-200 p-6 shadow-sm dark:border-gray-800"
                >
                  <div className="inline-flex rounded-xl bg-indigo-100 p-3 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">{title}</h3>
                  <p className="mt-2 text-gray-600 dark:text-gray-300">{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="common-tasks" aria-labelledby="common-tasks-heading" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 lg:py-16">
          <div>
            <h2 id="common-tasks-heading" className="text-3xl font-bold text-gray-900 dark:text-white">{t('howItWorks.commonTask')}</h2>
            <p className="mt-3 max-w-3xl text-gray-600 dark:text-gray-300">
              {t('howItWorks.commonTaskDescription')}
            </p>

            <div className="mt-10 grid gap-6 md:grid-cols-2">
              <div className="space-y-6">
                <article className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('howItWorks.roleTasks')}</h3>
                  <ul className="mt-5 space-y-4">
                    {teamTasks.map((task) => (
                      <li key={task} className="flex items-start gap-3 text-gray-600 dark:text-gray-300">
                        <Users className="mt-0.5 h-4 w-4 flex-none text-indigo-600 dark:text-indigo-300" />
                        <span>{task}</span>
                      </li>
                    ))}
                  </ul>
                </article>

                {reportSteps
                  .filter((step) => step.column === 'left')
                  .map(({ title, description }) => (
                    <article
                      key={title}
                      className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900"
                    >
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
                      <p className="mt-1 text-gray-600 dark:text-gray-300">{description}</p>
                    </article>
                  ))}
              </div>

              <div className="space-y-6">
                {reportSteps
                  .filter((step) => step.column === 'right')
                  .map(({ title, description }) => (
                    <article
                      key={title}
                      className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900"
                    >
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
                      <p className="mt-1 text-gray-600 dark:text-gray-300">{description}</p>
                    </article>
                  ))}
              </div>
            </div>
          </div>
        </section>

        <section id="results" aria-labelledby="results-heading" className="bg-white dark:bg-gray-900">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 lg:py-16">
            <div className="max-w-3xl">
              <h2 id="results-heading" className="text-3xl font-bold text-gray-900 dark:text-white">{t('howItWorks.howToReadResults')}</h2>
              <p className="mt-3 text-gray-600 dark:text-gray-300">
                {t('howItWorks.howToReadDescription')}
              </p>
            </div>

            <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
              {resultMeaning.map(({ label, description, icon: Icon }) => (
                <article
                  key={label}
                  className="rounded-2xl border border-gray-200 p-6 shadow-sm dark:border-gray-800"
                >
                  <Icon className="h-6 w-6 text-indigo-600 dark:text-indigo-300" />
                  <h3 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">{label}</h3>
                  <p className="mt-2 text-gray-600 dark:text-gray-300">{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="annotated-pdf" aria-labelledby="annotated-pdf-heading" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 lg:py-16">
          <div className="max-w-3xl">
            <h2 id="annotated-pdf-heading" className="text-3xl font-bold text-gray-900 dark:text-white">{t('howItWorks.annotatedPdfTitle')}</h2>
            <p className="mt-3 text-gray-600 dark:text-gray-300">
              {t('howItWorks.annotatedPdfDescription')}
            </p>
          </div>

          <div className="mt-10 grid gap-6 md:grid-cols-2">
            {annotatedPdfSteps.map(({ title, description }) => (
              <article
                key={title}
                className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900"
              >
                <div className="inline-flex rounded-xl bg-orange-100 p-3 text-orange-600 dark:bg-orange-500/10 dark:text-orange-300">
                  <Highlighter className="h-6 w-6" />
                </div>
                <h3 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">{title}</h3>
                <p className="mt-2 text-gray-600 dark:text-gray-300">{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="account-settings" aria-labelledby="account-settings-heading" className="bg-white dark:bg-gray-900">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 lg:py-16">
            <div className="max-w-3xl">
              <h2 id="account-settings-heading" className="text-3xl font-bold text-gray-900 dark:text-white">{t('howItWorks.accountSettingsTitle')}</h2>
              <p className="mt-3 text-gray-600 dark:text-gray-300">
                {t('howItWorks.accountSettingsDescription')}
              </p>
            </div>

            <div className="mt-10 grid gap-6 md:grid-cols-2">
              {accountSections.map(({ title, description, icon: Icon }) => (
                <article
                  key={title}
                  className="rounded-2xl border border-gray-200 p-6 shadow-sm dark:border-gray-800"
                >
                  <Icon className="h-6 w-6 text-indigo-600 dark:text-indigo-300" />
                  <h3 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">{title}</h3>
                  <p className="mt-2 text-gray-600 dark:text-gray-300">{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="team-features" aria-labelledby="team-features-heading" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 lg:py-16">
          <div className="max-w-3xl">
            <h2 id="team-features-heading" className="text-3xl font-bold text-gray-900 dark:text-white">{t('howItWorks.teamFeaturesTitle')}</h2>
            <p className="mt-3 text-gray-600 dark:text-gray-300">
              {t('howItWorks.teamFeaturesDescription')}
            </p>
          </div>

          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {teamFeatureSections.map(({ title, description, icon: Icon }) => (
              <article
                key={title}
                className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900"
              >
                <Icon className="h-6 w-6 text-indigo-600 dark:text-indigo-300" />
                <h3 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">{title}</h3>
                <p className="mt-2 text-gray-600 dark:text-gray-300">{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="admin-features" aria-labelledby="admin-features-heading" className="bg-white dark:bg-gray-900">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 lg:py-16">
            <div className="max-w-3xl">
              <h2 id="admin-features-heading" className="text-3xl font-bold text-gray-900 dark:text-white">{t('howItWorks.adminFeaturesTitle')}</h2>
              <p className="mt-3 text-gray-600 dark:text-gray-300">
                {t('howItWorks.adminFeaturesDescription')}
              </p>
            </div>

            <div className="mt-10 grid gap-6 md:grid-cols-2">
              {adminFeatureSections.map(({ title, description, icon: Icon }) => (
                <article
                  key={title}
                  className="rounded-2xl border border-gray-200 p-6 shadow-sm dark:border-gray-800"
                >
                  <Icon className="h-6 w-6 text-indigo-600 dark:text-indigo-300" />
                  <h3 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">{title}</h3>
                  <p className="mt-2 text-gray-600 dark:text-gray-300">{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="help" aria-labelledby="help-heading" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 lg:py-16">
          <div>
            <h2 id="help-heading" className="text-3xl font-bold text-gray-900 dark:text-white">{t('howItWorks.usefulThings')}</h2>
            <ul className="mt-6 space-y-4">
              {supportTips.map((tip) => (
                <li key={tip} className="flex items-start gap-3 text-gray-600 dark:text-gray-300">
                  <Bell className="mt-0.5 h-5 w-5 flex-none text-indigo-600 dark:text-indigo-300" />
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default HowItWorks;
