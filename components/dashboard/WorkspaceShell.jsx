"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import SidebarIcon, { navLabel } from "./SidebarIcon";
import ChatButton from "./ChatButton";
import NotificationBell from "./NotificationBell";
import GlobalSearch from "./GlobalSearch";

const EASE = [0.22, 1, 0.36, 1];

// Nav items stagger in once on first mount. Deliberately NOT applied to the
// <aside>/<header> elements themselves — those already carry the mobile
// open/close slide transform as a plain CSS class swap
// (-translate-x-full/translate-x-0), and a Framer Motion `animate` on the
// same element would set an inline transform that silently overrides it,
// breaking the mobile menu. Animating the children instead sidesteps that
// entirely.
const navStagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.035, delayChildren: 0.05 } },
};
const navItem = {
  hidden: { opacity: 0, x: -10 },
  show: { opacity: 1, x: 0, transition: { duration: 0.3, ease: EASE } },
};
const headerFade = {
  hidden: { opacity: 0, y: -8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: EASE } },
};

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <img
        src="/logo.jpeg"
        alt="Next Academy logo"
        className="h-10 w-10 rounded-xl object-contain shadow-sm"
      />
      <div>
        <p className="text-sm font-bold leading-tight text-ink">
          Next Academy
        </p>
        <p className="text-[9px] font-semibold uppercase tracking-[.18em] text-primary">
          Learning platform
        </p>
      </div>
    </div>
  );
}

// Extracted from the Director dashboard shell (app/dashboard/[role]/page.jsx)
// so every workspace shares the exact same sidebar/header chrome. Keep this
// component's markup/classes in lockstep with Director's — this IS Director's
// shell, just parameterized by role.
export default function WorkspaceShell({
  modules,
  active,
  getHref,
  onNavigate,
  renderBadge,
  name,
  initials,
  photoURL,
  uid,
  userEmail,
  headerTitle,
  headerSubtitle,
  onLogout,
  children,
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  function handleNavClick(module) {
    onNavigate?.(module);
    setMobileOpen(false);
  }

  return (
    <main className="min-h-screen bg-page text-ink md:flex">
      <aside
        className={`${mobileOpen ? "translate-x-0" : "-translate-x-full"} fixed inset-y-0 left-0 z-40 flex h-screen w-[280px] flex-col border-r border-border-subtle bg-card shadow-2xl transition-transform duration-300 md:sticky md:top-0 md:translate-x-0 md:shadow-none`}
      >
        <div className="flex items-center justify-between border-b border-border-subtle p-5">
          <Brand />
          <button
            onClick={() => setMobileOpen(false)}
            className="text-xl text-subtle md:hidden"
            aria-label="Close menu"
          >
            ×
          </button>
        </div>
        <motion.nav
          className="flex-1 overflow-y-auto px-4 py-5"
          initial="hidden"
          animate="show"
          variants={navStagger}
        >
          {modules.map((module) => {
            const className = `mb-2 flex min-h-12 w-full items-center gap-4 rounded-xl px-4 py-3 text-left text-[15px] font-semibold transition ${active === module ? "border border-red-line bg-active text-ink" : "text-muted hover:bg-page hover:text-ink"}`;
            const content = (
              <>
                <span className={`grid h-6 w-6 shrink-0 place-items-center ${active === module ? "text-primary" : ""}`}>
                  <SidebarIcon name={module} className="h-6 w-6" />
                </span>
                {navLabel(module)}
                {renderBadge?.(module)}
              </>
            );
            const href = getHref?.(module);
            return (
              <motion.div key={module} variants={navItem} whileHover={{ x: 3 }} whileTap={{ scale: 0.98 }}>
                {href ? (
                  <Link href={href} onClick={() => handleNavClick(module)} className={className}>
                    {content}
                  </Link>
                ) : (
                  <button onClick={() => handleNavClick(module)} className={className}>
                    {content}
                  </button>
                )}
              </motion.div>
            );
          })}
        </motion.nav>
      </aside>
      {mobileOpen && (
        <button
          className="fixed inset-0 z-30 bg-slate-950/60 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation"
        />
      )}
      <section className="min-w-0 flex-1">
        <motion.header
          className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border-subtle bg-card px-4 shadow-sm md:px-6"
          initial="hidden"
          animate="show"
          variants={headerFade}
        >
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="text-xl text-muted md:hidden"
              aria-label="Open menu"
            >
              ☰
            </button>
            <div>
              <h1 className="text-lg font-bold text-ink">{headerTitle}</h1>
              <p className="hidden text-[10px] uppercase tracking-wider text-subtle sm:block">
                {headerSubtitle}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <GlobalSearch role="Teacher" uid={uid} modules={modules} onNavigate={onNavigate} getHref={getHref} />
            <ChatButton href={getHref?.("Chat")} onClick={() => onNavigate?.("Chat")} />
            <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
              <Link
                href={getHref?.("Settings") || "#"}
                className="flex items-center gap-2 rounded-full border border-border-subtle bg-card py-1 pl-1 pr-3 transition-colors hover:bg-page"
                aria-label="Open settings"
                title={userEmail}
              >
                {photoURL ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoURL} alt="" className="h-8 w-8 rounded-full border-2 border-primary object-cover" />
                ) : (
                  <span className="grid h-8 w-8 place-items-center rounded-full border-2 border-primary bg-active text-xs font-bold text-primary">
                    {initials}
                  </span>
                )}
                <span className="hidden text-left sm:block">
                  <b className="block text-xs text-ink">{name}</b>
                </span>
              </Link>
            </motion.div>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={onLogout}
              className="rounded-full border border-border-subtle bg-card px-4 py-2 text-xs font-bold text-ink transition-colors hover:bg-page"
            >
              Sign out
            </motion.button>
            <NotificationBell />
          </div>
        </motion.header>
        <div className="px-4 py-4 md:py-6 lg:py-8">
          <div className="space-y-6">{children}</div>
        </div>
      </section>
    </main>
  );
}
