"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { doc, onSnapshot } from "firebase/firestore";
import { useAuth } from "../../../lib/auth-context";
import { db } from "../../../lib/firebase";
import { prefetchTraining } from "../../../lib/services/training-service";
import { prefetchMyTraining } from "../../../lib/student-data";
import { prefetchStudentDirectory } from "../../../lib/services/student-service";
import { prefetchTeacherAssignments } from "../../../lib/services/teacher-assignment-service";
import { prefetchRoomBooking } from "../../../lib/room-booking-data";
import { prefetchDocuments } from "../../../lib/documents-data";
import { prefetchUsers } from "../../../lib/services/user-service";
import { prefetchAchievements } from "../../../lib/achievement-data";
import { prefetchManagerExams } from "../../../lib/exam-data";
import { prefetchFinanceOverview } from "../../../lib/services/finance-service";
import { prefetchInvoices } from "../../../lib/services/invoice-service";
import StudentManagement from "../../../components/StudentManagement";
import TeacherAssignment from "../../../components/teacher-assignment/TeacherAssignment";
import EventManagement from "../../../components/events/EventManagement";
import StudentEvents from "../../../components/events/StudentEvents";
import SidebarIcon from "../../../components/dashboard/SidebarIcon";
import DirectorOverview from "../../../components/dashboard/DirectorOverview";
import DirectorShell from "../../../components/dashboard/DirectorShell";
import AdminShell from "../../../components/dashboard/AdminShell";
import UserManagement from "../../../components/users/UserManagement";
import TrainingManagement from "../../../components/training/TrainingManagement";
import FinanceManagement from "../../../components/finance/FinanceManagement";
import MyPaymentSummary from "../../../components/students/MyPaymentSummary";
import LoadingScreen from "../../../components/dashboard/LoadingScreen";
import ChatWorkspace from "../../../components/chat/ChatWorkspace";
import SettingsPage from "../../../components/settings/SettingsPage";
import AccountPendingScreen from "../../../components/dashboard/AccountPendingScreen";
import ContactInquiries from "../../../components/dashboard/ContactInquiries";
import { useNewInquiryCount } from "../../../lib/contact-inquiries-data";
import IdCardPrint from "../../../components/teacher/IdCardPrint";
import Shop from "../../../components/shop/Shop";
import AchievementManagement from "../../../components/achievement/AchievementManagement";
import StudentAchievements from "../../../components/achievement/StudentAchievements";
import StudentAttendance from "../../../components/students/StudentAttendance";
import StudentExams from "../../../components/exams/StudentExams";
import TeacherExams from "../../../components/exams/TeacherExams";
import StudentDashboardHome from "../../../components/students/StudentDashboardHome";
import AdminQrScanner from "../../../components/attendance/AdminQrScanner";
import RoomBooking from "../../../components/room-booking/RoomBooking";
import DocumentsModule from "../../../components/documents/DocumentsModule";

export const roleConfig = {
  // Every self-registered account lands here first (see createProfile in
  // lib/auth-context.js) — full access immediately, no approval wait, but
  // deliberately read-only/browse-only until they're enrolled in a
  // training (which auto-promotes them to Student — see
  // lib/server/enrollment-core.js) or a Director/Admin promotes them by
  // hand from the Users screen.
  Guest: {
    greeting: "Explore our trainings and events — enroll in one to unlock your full student dashboard.",
    modules: ["Dashboard", "Training", "Events", "Chat", "Settings"],
    stats: [],
  },
  Student: {
    greeting: "Continue building your future with focused, practical learning.",
    modules: [
      "Dashboard",
      "My Training",
      "Events",
      "Attendance",
      "Documents",
      "Achievements",
      "Model Test",
      "My Shop",
      "ID Card",
      "Chat",
      "Settings",
    ],
  },
  Volunteer: {
    greeting: "Make an impact in your community.",
    modules: [
      "Dashboard",
      "Events",
      "Activities",
      "Training",
      "Achievements",
      "Chat",
      "Settings",
    ],
    stats: [
      ["Students supported", "24", "this month", "â™™"],
      ["Hours logged", "18", "this week", "â—·"],
      ["Events joined", "06", "upcoming", "â—‰"],
      ["Impact score", "94%", "positive", "âœ¦"],
    ],
  },
  Facilitator: {
    greeting: "Your sessions are ready to lead.",
    modules: [
      "Dashboard",
      "Training",
      "Students",
      "Events",
      "Attendance",
      "Documents",
      "Certificates",
      "Chat",
      "Settings",
    ],
    stats: [
      ["Active cohorts", "06", "in progress", "â–¦"],
      ["Sessions hosted", "18", "this month", "â—·"],
      ["Feedback rate", "94%", "positive", "âœ“"],
      ["Students reached", "126", "this term", "â™™"],
    ],
  },
  Teacher: {
    greeting:
      "Your classroom data will appear here when teacher records are available.",
    modules: [
      "Dashboard",
      "Students",
      "Training",
      "Attendance",
      "Events",
      "Achievements",
      "Certificates",
      "Chat",
      "Settings",
    ],
    stats: [],
  },
  Director: {
    greeting:
      "Your organization overview will appear here when Director data sources are available.",
    modules: [
      "Dashboard",
      "Students",
      "Teacher",
      "Training",
      "Event",
      "Room Booking",
      "Finance",
      "Documents",
      "My Shop",
      "User",
      "Contact Inquiries",
      "Chat",
      "Achievement",
      "Model Test",
      "ID Card",
      "Scan QR Code",
      "Settings",
    ],
    stats: [],
  },
  Admin: {
    greeting: "Everything is under control.",
    modules: [
      "Dashboard",
      "Students",
      "Teacher",
      "Training",
      "Event",
      "Room Booking",
      "Finance",
      "Documents",
      "My Shop",
      "User",
      "Contact Inquiries",
      "Chat",
      "Achievement",
      "Model Test",
      "Scan QR Code",
      "Settings",
    ],
    stats: [
      ["Total users", "684", "â†‘ 32 this month", "â™™"],
      ["Pending reviews", "14", "need attention", "!"],
      ["System health", "99.9%", "uptime", "âœ“"],
      ["Active programs", "50", "across academy", "â–¦"],
    ],
  },
};
const teacherUnavailableStats = [
  ["My students", "â€”", "No class relationship recorded"],
  ["Assignments", "â€”", "No assignment data available"],
  ["Attendance", "â€”", "No attendance records available"],
  ["Class rating", "â€”", "No rating records available"],
];

function EmptyDataPanel({ title, message }) {
  return (
    <div className="rounded-3xl border border-dashed border-border-subtle bg-card p-6 shadow-sm">
      <h2 className="font-bold text-ink">{title}</h2>
      <p className="mt-4 text-sm text-muted">{message}</p>
    </div>
  );
}

function DirectorDashboard({ profile, user }) {
  const { logout } = useAuth();
  const config = roleConfig.Director;
  // A page navigated to from here (e.g. an event's own detail route) can
  // link back with ?tab=<Module> so returning here restores that tab
  // instead of always resetting to the default "Dashboard" tab — the tab
  // itself is otherwise only client-side state, invisible to the URL.
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const [active, setActive] = useState(
    requestedTab && config.modules.includes(requestedTab) ? requestedTab : "Dashboard",
  );
  // Keeps `?tab=` in sync with whatever tab is actually showing, not just
  // on the way in — without this, clicking around the sidebar never
  // touches the URL, so refreshing on (say) Settings silently dropped back
  // to Dashboard on reload. `history.replaceState` (not router.replace)
  // deliberately avoids any Next.js navigation/refetch — a pure URL
  // bookmark update, no measurable perf cost (confirmed: reverted this
  // once to A/B against perceived slowness, restored since it fixes a
  // real bug for effectively zero cost — the slowness was unrelated,
  // local dev-mode compile overhead).
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("tab") === active) return;
    url.searchParams.set("tab", active);
    window.history.replaceState(null, "", url);
  }, [active]);
  // Perceived-speed only — see DashboardContent's identical effect. Director
  // sees every one of these sidebar items unconditionally, so all fire
  // together the moment the dashboard mounts, before any tab is clicked.
  useEffect(() => {
    prefetchTraining();
    prefetchStudentDirectory();
    prefetchTeacherAssignments();
    prefetchRoomBooking();
    prefetchDocuments();
    prefetchUsers();
    prefetchAchievements();
    prefetchManagerExams();
    prefetchFinanceOverview();
    prefetchInvoices();
  }, []);
  const name =
    profile.displayName ||
    user.displayName ||
    user.email?.split("@")[0] ||
    "Director";
  const initials = name.slice(0, 2).toUpperCase();
  const newInquiryCount = useNewInquiryCount();

  return (
    <DirectorShell
      modules={config.modules}
      active={active}
      onNavigate={setActive}
      name={name}
      initials={initials}
      photoURL={profile?.photoURL}
      uid={user.uid}
      userEmail={user.email}
      headerTitle={active === "Dashboard" ? "Director Dashboard" : active}
      headerSubtitle="Organization overview"
      onLogout={logout}
      badges={{ "Contact Inquiries": newInquiryCount }}
    >
            {active === "Dashboard" ? (
              <DirectorOverview onNavigate={setActive} />
            ) : active === "Students" ? (
              <StudentManagement role="Director" />
            ) : active === "User" ? (
              <UserManagement role="Director" currentUserId={user.uid} />
            ) : active === "Training" ? (
              <TrainingManagement role="Director" />
            ) : active === "Teacher" ? (
              <TeacherAssignment onNavigate={setActive} />
            ) : active === "Event" ? (
              <EventManagement />
            ) : active === "Room Booking" ? (
              <RoomBooking role="Director" />
            ) : active === "Documents" ? (
              <DocumentsModule role="Director" />
            ) : active === "Finance" ? (
              <FinanceManagement />
            ) : active === "Contact Inquiries" ? (
              <ContactInquiries />
            ) : active === "My Shop" ? (
              <Shop role="Director" uid={user.uid} />
            ) : active === "Achievement" ? (
              <AchievementManagement />
            ) : active === "Model Test" ? (
              <TeacherExams teacherId={user.uid} isManager />
            ) : active === "Scan QR Code" ? (
              <AdminQrScanner />
            ) : active === "ID Card" ? (
              <section className="rounded-3xl border border-border-subtle/70 bg-card p-5 shadow-sm md:p-8">
                <div className="mb-6 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-[.2em] text-primary">Digital Membership</p>
                  <h2 className="mt-1 text-2xl font-black text-ink sm:text-3xl">Your ID Card</h2>
                  <p className="mx-auto mt-2 max-w-md text-xs text-muted sm:text-sm">
                    Keep this ready at events and training — first scan checks you in, second scan checks you out and credits your hours.
                  </p>
                </div>
                <IdCardPrint
                  mode="self"
                  roleLabel="Director"
                  fallbackName={name}
                  fallbackEmail={user.email}
                  photoURL={profile?.photoURL}
                  active={profile?.active}
                  status={profile?.status}
                  onEditProfile={() => setActive("Settings")}
                />
              </section>
            ) : active === "Chat" ? (
              <ChatWorkspace currentUserId={user.uid} currentUserRole="Director" currentUserName={name} />
            ) : active === "Settings" ? (
              <SettingsPage />
            ) : (
              <EmptyDataPanel
                title={`${active} module`}
                message="This Director module does not have an implemented page or permitted Firestore data source yet."
              />
            )}
    </DirectorShell>
  );
}

function DashboardContent({ role, profile, user }) {
  const router = useRouter();
  const { logout } = useAuth();
  const config = roleConfig[role] || roleConfig.Student;
  // See DirectorDashboard's identical comment: ?tab=<Module> lets a page
  // navigated away to (e.g. an event's own detail route) link back to the
  // specific tab it came from, instead of always resetting to "Dashboard".
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const [active, setActive] = useState(
    requestedTab && config.modules.includes(requestedTab) ? requestedTab : "Dashboard",
  );
  // See DirectorDashboard's identical effect for why.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("tab") === active) return;
    url.searchParams.set("tab", active);
    window.history.replaceState(null, "", url);
  }, [active]);
  const [teacherProfile, setTeacherProfile] = useState(profile);
  const [teacherProfileError, setTeacherProfileError] = useState("");
  const name =
    profile.displayName ||
    user.displayName ||
    user.email?.split("@")[0] ||
    "Member";
  const initials = name.slice(0, 2).toUpperCase();
  const newInquiryCount = useNewInquiryCount(role === "Admin");

  useEffect(() => {
    if (role === "Teacher") router.replace("/teacher/dashboard");
  }, [role, router]);

  // Perceived-speed only: fires the Training tab's data fetch the moment
  // the dashboard itself finishes loading, not only once the user clicks
  // into "Training" — loadTraining's own cache (lib/services/
  // training-service.js) means TrainingManagement's later mount-time call
  // reuses this same in-flight/completed request instead of firing twice.
  // Skipped for Student (their "My Training" tab is MyPaymentSummary, a
  // completely different component/endpoint — this fetch would be wasted)
  // and Teacher (redirected away above, to their own workspace).
  useEffect(() => {
    if (role && role !== "Teacher" && role !== "Student") prefetchTraining();
  }, [role]);
  // Student's own equivalent of the prefetch above — see
  // lib/student-data.js's prefetchMyTraining for why this needs a
  // separate (listener-based) mechanism instead of reusing
  // prefetchTraining's plain promise cache.
  useEffect(() => {
    if (role === "Student" && user?.uid) prefetchMyTraining(user.uid);
  }, [role, user?.uid]);
  // Perceived-speed only, for the remaining Admin/Director-only sidebar
  // modules (Students, Teacher, Room Booking, User, Achievement, Model
  // Test) — gated to the roles whose roleConfig.modules actually renders
  // each of these components (see the role checks in the JSX below).
  // Documents is separate: Student/Facilitator/Admin/Director all render
  // DocumentsModule from their "Documents" tab (Director's own identical
  // effect above covers Director).
  useEffect(() => {
    if (role === "Admin") {
      prefetchStudentDirectory();
      prefetchTeacherAssignments();
      prefetchRoomBooking();
      prefetchUsers();
      prefetchAchievements();
      prefetchManagerExams();
      prefetchFinanceOverview();
      prefetchInvoices();
    }
    if (role === "Student" || role === "Facilitator" || role === "Admin") {
      prefetchDocuments();
    }
  }, [role]);

  useEffect(() => {
    if (role !== "Teacher" || !db || !user?.uid) return undefined;
    return onSnapshot(
      doc(db, "users", user.uid),
      (snapshot) => {
        setTeacherProfile(
          snapshot.exists() ? { uid: user.uid, ...snapshot.data() } : null,
        );
        setTeacherProfileError("");
      },
      () => setTeacherProfileError("Unable to load your live teacher profile."),
    );
  }, [role, user?.uid]);

  if (role === "Director")
    return <DirectorDashboard profile={profile} user={user} />;

  if (role === "Teacher") {
    return (
      <div className="grid min-h-screen place-items-center bg-page text-sm text-muted">
        Opening your teacher workspace...
      </div>
    );
  }

  function selectModule(module) {
    setActive(module);
  }

  // Students get the real analytics home (StudentDashboardHome); the
  // remaining roles that still fall through to the generic dashboard
  // below render whatever static summary their config defines.
  const displayStats = config.stats || [];

  return (
    <AdminShell
      role={role}
      modules={config.modules}
      active={active}
      onNavigate={selectModule}
      name={name}
      initials={initials}
      photoURL={profile?.photoURL}
      uid={user.uid}
      userEmail={user.email}
      headerTitle={active === "Dashboard" ? `${role} Dashboard` : active}
      onLogout={logout}
      badges={{ "Contact Inquiries": newInquiryCount }}
    >
            {role === "Admin" && active === "Students" ? (
              <StudentManagement role="Admin" />
            ) : role === "Admin" && active === "User" ? (
              <UserManagement role="Admin" currentUserId={user.uid} />
            ) : role === "Admin" && active === "Finance" ? (
              <FinanceManagement />
            ) : role === "Admin" && active === "Contact Inquiries" ? (
              <ContactInquiries />
            ) : role === "Student" && (active === "Training" || active === "My Training") ? (
              <MyPaymentSummary />
            ) : (active === "Training" || active === "My Training") ? (
              <TrainingManagement role={role} />
            ) : role === "Admin" && active === "Teacher" ? (
              <TeacherAssignment onNavigate={setActive} />
            ) : role === "Admin" && active === "Event" ? (
              <EventManagement />
            ) : role === "Admin" && active === "Room Booking" ? (
              <RoomBooking role="Admin" />
            ) : active === "Documents" ? (
              <DocumentsModule role={role} />
            ) : active === "Events" ? (
              <StudentEvents />
            ) : active === "My Shop" ? (
              <Shop role={role} uid={user.uid} />
            ) : role === "Admin" && active === "Achievement" ? (
              <AchievementManagement />
            ) : role === "Admin" && active === "Model Test" ? (
              <TeacherExams teacherId={user.uid} isManager />
            ) : role === "Admin" && active === "Scan QR Code" ? (
              <AdminQrScanner />
            ) : (active === "Achievements" || active === "Certificates") ? (
              <StudentAchievements uid={user.uid} />
            ) : active === "Model Test" ? (
              <StudentExams uid={user.uid} />
            ) : role === "Student" && active === "Attendance" ? (
              <StudentAttendance />
            ) : role === "Student" && active === "Dashboard" ? (
              <StudentDashboardHome
                uid={user.uid}
                name={name}
                greeting={config.greeting}
                modules={config.modules}
                activeModule={active}
                onNavigate={selectModule}
              />
            ) : active === "ID Card" ? (
              <section className="rounded-3xl border border-border-subtle/70 bg-card p-5 shadow-sm md:p-8">
                <div className="mb-6 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-[.2em] text-primary">Digital Membership</p>
                  <h2 className="mt-1 text-2xl font-black text-ink sm:text-3xl">Your ID Card</h2>
                  <p className="mx-auto mt-2 max-w-md text-xs text-muted sm:text-sm">
                    Keep this ready at events and training — first scan checks you in, second scan checks you out and credits your hours.
                  </p>
                </div>
                <IdCardPrint
                  mode="self"
                  roleLabel={role}
                  fallbackName={name}
                  fallbackEmail={user.email}
                  photoURL={profile?.photoURL}
                  active={profile?.active}
                  status={profile?.status}
                  onEditProfile={() => selectModule("Settings")}
                />
              </section>
            ) : active === "Chat" ? (
              <ChatWorkspace currentUserId={user.uid} currentUserRole={role} currentUserName={name} />
            ) : active === "Settings" ? (
              <SettingsPage />
            ) : (
              <>
            {active === "Dashboard" && (
            <section className="flex flex-col justify-between gap-6 rounded-3xl border border-[#f3aaaa] bg-[linear-gradient(120deg,#fff0f0_0%,#fff7f7_45%,#ffffff_100%)] p-6 text-ink shadow-xl md:flex-row md:items-center md:p-8">
              <div>
                <h2 className="text-3xl font-extrabold">
                  Welcome, {name}
                </h2>
                <p className="mt-2 max-w-xl text-xs leading-relaxed text-muted">
                  {config.greeting}
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => selectModule(config.modules[1] || "Training")}
                  className="rounded-xl border border-border-subtle bg-card px-4 py-3 text-xs font-bold text-primary shadow transition hover:bg-active"
                >
                  View programs
                </button>
                <button
                  onClick={() => selectModule(config.modules[0])}
                  className="rounded-xl border border-border-subtle px-4 py-3 text-xs font-bold text-ink transition hover:bg-active"
                >
                  Quick action
                </button>
              </div>
            </section>
            )}
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {(role === "Teacher"
                ? teacherUnavailableStats
                : displayStats
              ).map(([label, value, note, icon], index) => (
                <article
                  key={label}
                  onClick={role === "Student" && label === "Attendance" ? () => selectModule("Attendance") : undefined}
                  className={`flex items-center justify-between rounded-2xl border border-border-subtle/70 bg-card p-5 shadow-sm ${role === "Student" && label === "Attendance" ? "cursor-pointer transition hover:border-red-line" : ""}`}
                >
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-subtle">
                      {label}
                    </p>
                    <h3 className="mt-2 text-2xl font-extrabold text-ink">
                      {value}
                    </h3>
                    <span
                      className={`mt-2 inline-block text-[10px] font-bold ${role === "Teacher" ? "text-muted" : index === 1 ? "text-warning" : "text-success"}`}
                    >
                      {note}
                    </span>
                  </div>
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-active text-xl text-primary shadow-inner">
                    {icon || "â€”"}
                  </div>
                </article>
              ))}
            </section>
            {role === "Teacher" && (
              <div className="rounded-2xl border border-warning bg-warning-soft px-5 py-4 text-xs text-warning">
                Teacher dashboard data is connected to your Firebase profile and
                updates live. Class, assignment, attendance, schedule, activity,
                and rating records are not present in the current project schema
                yet.
                {teacherProfileError && (
                  <span className="mt-1 block font-semibold text-primary">
                    {teacherProfileError}
                  </span>
                )}
                {teacherProfile && (
                  <span className="mt-1 block text-warning">
                    Profile sync active for {teacherProfile.email || user.email}
                    .
                  </span>
                )}
              </div>
            )}
            <section className="rounded-3xl border border-border-subtle/70 bg-card p-5 shadow-sm md:p-6">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-ink">
                    Workspace modules
                  </h2>
                  <p className="mt-1 text-xs text-muted">
                    Access the tools available for your {role.toLowerCase()}{" "}
                    role.
                  </p>
                </div>
                <span className="hidden rounded-full bg-page px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted sm:block">
                  {config.modules.length} modules
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                {config.modules.map((module) => (
                  <button
                    key={module}
                    onClick={() => selectModule(module)}
                    className={`group rounded-2xl border p-4 text-center transition ${active === module ? "border-primary bg-active" : "border-border-subtle bg-page/50 hover:border-red-line hover:bg-active/50"}`}
                  >
                    <span
                      className={`mx-auto grid h-11 w-11 place-items-center rounded-xl bg-card text-lg shadow-sm transition group-hover:bg-primary group-hover:text-white ${active === module ? "bg-primary text-white" : "text-muted"}`}
                    >
                      <SidebarIcon name={module} className="h-6 w-6" />
                    </span>
                    <span className="mt-3 block text-[11px] font-bold text-muted">
                      {module}
                    </span>
                  </button>
                ))}
              </div>
            </section>
            {role === "Teacher" ? (
              <section className="grid gap-4 lg:grid-cols-2">
                <EmptyDataPanel
                  title="Upcoming schedule"
                  message="No upcoming classes, events, training sessions, or meetings are available for this teacher."
                />
                <EmptyDataPanel
                  title="Recent activity"
                  message="No recent teacher activity is available."
                />
              </section>
            ) : (
              <section className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-3xl border border-border-subtle/70 bg-card p-6 shadow-sm">
                  <div className="flex items-center justify-between">
                    <h2 className="font-bold text-ink">
                      Upcoming schedule
                    </h2>
                    <button className="text-xs font-bold text-primary">
                      View all â†’
                    </button>
                  </div>
                  {[
                    "Leadership in practice",
                    "Community workshop",
                    "Portfolio review",
                  ].map((item, index) => (
                    <div
                      className="flex items-center gap-4 border-b border-border-subtle py-4 last:border-0"
                      key={item}
                    >
                      <span className="grid h-11 w-11 place-items-center rounded-xl bg-active text-center text-primary">
                        <b className="block text-lg">{10 + index * 2}</b>
                      </span>
                      <div>
                        <b className="block text-xs text-ink">{item}</b>
                        <span className="text-[10px] text-muted">
                          {index === 0
                            ? "Today Â· 14:00 Â· Room A"
                            : "This week Â· Next Academy"}
                        </span>
                      </div>
                      <span className="ml-auto text-subtle">â†’</span>
                    </div>
                  ))}
                </div>
                <div className="rounded-3xl border border-border-subtle/70 bg-card p-6 shadow-sm">
                  <h2 className="font-bold text-ink">Recent activity</h2>
                  {[
                    "Module completed",
                    "Achievement unlocked",
                    "Feedback received",
                  ].map((item, index) => (
                    <div
                      className="flex items-center gap-3 border-b border-border-subtle py-4 last:border-0"
                      key={item}
                    >
                      <span className="grid h-8 w-8 place-items-center rounded-full bg-success-soft text-sm text-success">
                        {index === 0 ? "âœ“" : index === 1 ? "âœ¦" : "â†—"}
                      </span>
                      <div>
                        <b className="block text-xs text-ink">{item}</b>
                        <span className="text-[10px] text-muted">
                          {index === 0
                            ? "Conflict resolution Â· 2h ago"
                            : index === 1
                              ? "Thoughtful collaborator"
                              : "From your academy mentor"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
              </>
            )}
    </AdminShell>
  );
}

export default function RoleDashboardPage() {
  const params = useParams();
  const router = useRouter();
  const { user, profile, loading, logout } = useAuth();
  const rawRole = params?.role;

  const roleKey = Array.isArray(rawRole) ? rawRole[0] : rawRole;
  const formattedRole = roleKey
    ? roleKey.charAt(0).toUpperCase() + roleKey.slice(1).toLowerCase()
    : "Student";

  const requestedRole = roleConfig[formattedRole] ? formattedRole : "Student";
  const profileRole = roleConfig[profile?.role] ? profile.role : null;

  const requiresVerification = Boolean(
    user?.providerData?.some(
      (provider) => provider.providerId === "password",
    ) && !user.emailVerified,
  );

  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    if (!loading && (!user || requiresVerification || !profileRole || requestedRole !== profileRole)) {
      router.replace("/login");
    }
  }, [loading, profileRole, requestedRole, requiresVerification, router, user]);

  if (loading || !splashDone) {
    return <LoadingScreen ready={!loading} onFinished={() => setSplashDone(true)} />;
  }

  if (!user || requiresVerification || !profileRole || requestedRole !== profileRole) {
    return (
      <div className="grid min-h-screen place-items-center bg-page text-sm text-muted">
        Redirecting to login...
      </div>
    );
  }

  // Central approval gate — new self-registrations land as Guest+"active"
  // (see createProfile in lib/auth-context.js) and are never blocked here.
  // This only fires when a Director/Admin has explicitly set someone's
  // status to "pending"/"rejected" by hand (any role, not just Student),
  // so every tab DashboardContent renders is blocked in this one place
  // rather than needing its own check.
  const isBlockedUser = profile?.status === "pending" || profile?.status === "rejected";
  if (isBlockedUser) {
    return <AccountPendingScreen status={profile.status} onLogout={logout} />;
  }

  return (
    <DashboardContent role={profileRole} profile={profile || {}} user={user} />
  );
}









