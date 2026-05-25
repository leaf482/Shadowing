import { useEffect, useRef, useState } from "react";

function loadGoogleScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
  if (existing) {
    return new Promise((resolve) => {
      existing.addEventListener("load", () => resolve(), { once: true });
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google sign-in script failed to load."));
    document.head.appendChild(script);
  });
}

export default function GoogleSignInButton({ disabled, onSuccess, onError, onAvailable }) {
  const containerRef = useRef(null);
  const [clientId, setClientId] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/config");
        const data = await res.json().catch(() => ({}));
        const id =
          data?.googleClientId ||
          import.meta.env.VITE_GOOGLE_CLIENT_ID ||
          null;
        if (!cancelled) {
          setClientId(id || null);
          onAvailable?.(!!id);
        }
      } catch {
        const fallback = import.meta.env.VITE_GOOGLE_CLIENT_ID || null;
        if (!cancelled) {
          setClientId(fallback);
          onAvailable?.(!!fallback);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [onAvailable]);

  useEffect(() => {
    if (!clientId || !containerRef.current) return undefined;

    let cancelled = false;

    (async () => {
      try {
        await loadGoogleScript();
        if (cancelled || !containerRef.current) return;

        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: async (response) => {
            if (!response?.credential) {
              onError?.("Google sign-in was cancelled.");
              return;
            }
            try {
              const res = await fetch("/api/auth/google", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ credential: response.credential }),
              });
              const data = await res.json().catch(() => ({}));
              if (!res.ok) {
                onError?.(data?.error || "Google sign-in failed.");
                return;
              }
              onSuccess?.(data.email);
            } catch {
              onError?.("Could not connect to server. Please try again.");
            }
          },
          auto_select: false,
          cancel_on_tap_outside: true,
        });

        containerRef.current.innerHTML = "";
        window.google.accounts.id.renderButton(containerRef.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "rectangular",
          width: 320,
        });
        if (!cancelled) setReady(true);
      } catch {
        if (!cancelled) onError?.("Google sign-in is unavailable right now.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clientId, onError, onSuccess]);

  if (!clientId) return null;

  return (
    <div className={`login__google${ready ? " is-ready" : ""}`}>
      <div ref={containerRef} className="login__google-btn" aria-hidden={disabled} />
    </div>
  );
}
