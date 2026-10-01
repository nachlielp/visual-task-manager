import { createRoot } from "react-dom/client";
import { ClerkProvider, useAuth } from "@clerk/clerk-react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexReactClient } from "convex/react";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App.tsx";
import { ConfirmProvider, ToastProvider } from "@/components/ui";
import { TooltipProvider } from "@/components/ui/tooltip";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

// --- Service worker registration + auto-update loop -----------------------
// Production only: a SW in dev fights Vite's HMR. The SW itself calls
// skipWaiting()/clients.claim() (see sw.ts), so a freshly deployed version
// activates and takes control on its own — this fires "controllerchange".
// We reload once when that happens so the open tab picks up the new assets
// instead of serving the old precached shell.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  let refreshing = false;
  // Guard: on the very first install the page wasn't controlled before, so
  // that controllerchange must NOT reload (every new user would see a flash).
  let controlled = navigator.serviceWorker.controller !== null;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!controlled) {
      controlled = true;
      return;
    }
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker
      // updateViaCache: "none" — never let the HTTP cache serve a stale sw.js.
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((registration) => {
        // Browsers only auto-check the SW on navigation, and an installed PWA
        // may not navigate for weeks — so check explicitly on every signal
        // that the user is (back) in the app.
        let updateInFlight: Promise<void> | null = null;
        const checkForUpdate = () => {
          if (updateInFlight) return updateInFlight;
          updateInFlight = registration
            .update()
            .then(() => undefined)
            .catch((err) => console.warn("SW update check failed:", err))
            .finally(() => {
              updateInFlight = null;
            });
          return updateInFlight;
        };

        void checkForUpdate(); // startup
        window.setInterval(() => void checkForUpdate(), 60 * 1000);
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") void checkForUpdate();
        });
        window.addEventListener("online", () => void checkForUpdate());
      })
      .catch((err) => console.error("SW registration failed:", err));
  });
}
// ---------------------------------------------------------------------------

createRoot(document.getElementById("root")!).render(
  <ClerkProvider
    publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string}
  >
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      <BrowserRouter>
        <TooltipProvider delayDuration={300}>
          <ToastProvider>
            <ConfirmProvider>
              <App />
            </ConfirmProvider>
          </ToastProvider>
        </TooltipProvider>
      </BrowserRouter>
    </ConvexProviderWithClerk>
  </ClerkProvider>
);
