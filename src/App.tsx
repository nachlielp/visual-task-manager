import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { SignInButton, UserButton } from "@clerk/clerk-react";
import { NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui";
import { IconHome, IconSparkle } from "@/components/Icons";
import { cn } from "@/lib/utils";
import ProjectsPage from "@/pages/ProjectsPage";
import BoardPage from "@/pages/BoardPage";
import SettingsPage from "@/pages/SettingsPage";

function Logo() {
  const navigate = useNavigate();
  return (
    <button className="header-home flex items-center gap-2" onClick={() => navigate("/")}>
      <img src="/favicon.svg" alt="" className="h-7 w-7 rounded-md" />
      <span className="text-lg font-extrabold tracking-tight">Task Board</span>
    </button>
  );
}

function NavItem({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        cn(
          "flex h-[2.125rem] items-center gap-1.5 rounded-md px-2.5 text-[13px] font-bold",
          isActive ? "bg-tint text-brand" : "text-muted hover:bg-paper-dark hover:text-ink",
        )
      }
    >
      {children}
    </NavLink>
  );
}

function Footer() {
  return (
    <footer
      className="px-4 py-6 text-center text-xs font-semibold text-muted"
      data-build={__BUILD_HASH__}
    >
      Task Board · v{__APP_VERSION__} · {__BUILD_HASH__}
    </footer>
  );
}

export default function App() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b-[1.5px] border-line bg-paper/95 backdrop-saturate-150">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-3 px-4">
          <Logo />
          <Authenticated>
            <nav className="ml-2 flex items-center gap-1">
              <NavItem to="/">
                <IconHome className="text-base" />
                <span className="hidden sm:inline">Projects</span>
              </NavItem>
              <NavItem to="/settings">
                <IconSparkle className="text-base" />
                <span className="hidden sm:inline">Connect Claude</span>
              </NavItem>
            </nav>
            <div className="ml-auto">
              <UserButton />
            </div>
          </Authenticated>
        </div>
      </header>

      <main className="flex-1">
        <AuthLoading>
          <div className="p-10 text-center text-sm font-semibold text-muted">Loading…</div>
        </AuthLoading>
        <Unauthenticated>
          <Landing />
        </Unauthenticated>
        <Authenticated>
          <Routes>
            <Route path="/" element={<ProjectsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/p/:key" element={<BoardPage />} />
            <Route path="/p/:key/t/:number" element={<BoardPage />} />
            <Route path="*" element={<ProjectsPage />} />
          </Routes>
        </Authenticated>
      </main>
      <Footer />
    </div>
  );
}

function Landing() {
  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <div className="kicker mb-3 text-brand">Claude's work, on a board</div>
      <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
        See what Claude is <span className="text-brand">working on</span>.
      </h1>
      <p className="mx-auto mt-4 max-w-md text-muted">
        A Trello-style board with one project per repo. Claude creates and updates tickets over
        MCP — checklists, dependencies and progress notes — and you watch it live.
      </p>
      <div className="mt-8">
        <SignInButton mode="modal">
          <Button variant="primary">Sign in</Button>
        </SignInButton>
      </div>
    </div>
  );
}
