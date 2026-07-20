"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client-api";

type InstallConfig = {
  name: string;
  version: string;
  storeUrl: string;
  extensionId: string;
  downloadUrl: string;
  canOneClickInstall: boolean;
  canManage: boolean;
};

type ExtHello = {
  source: string;
  type: string;
  version?: string;
  extensionId?: string;
};

function pingExtension(extensionId: string): Promise<ExtHello | null> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (value: ExtHello | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const chromeRuntime = (
      window as unknown as {
        chrome?: {
          runtime?: {
            sendMessage: (
              id: string,
              msg: unknown,
              cb: (res: ExtHello & { ok?: boolean }) => void,
            ) => void;
            lastError?: { message?: string };
          };
        };
      }
    ).chrome?.runtime;

    if (!chromeRuntime?.sendMessage || !extensionId) {
      done(null);
      return;
    }

    try {
      chromeRuntime.sendMessage(
        extensionId,
        { type: "KINETIC_PING" },
        (res) => {
          if (chromeRuntime.lastError || !res?.ok) {
            done(null);
            return;
          }
          done(res);
        },
      );
    } catch {
      done(null);
    }

    setTimeout(() => done(null), 800);
  });
}

export default function ExtensionInstallPage() {
  const [config, setConfig] = useState<InstallConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [installed, setInstalled] = useState<ExtHello | null>(null);
  const [checking, setChecking] = useState(true);
  const [storeUrlDraft, setStoreUrlDraft] = useState("");
  const [extensionIdDraft, setExtensionIdDraft] = useState("");
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  const detect = useCallback(async (extensionId: string) => {
    setChecking(true);
    const viaExternal = await pingExtension(extensionId);
    if (viaExternal) {
      setInstalled(viaExternal);
      setChecking(false);
      return;
    }
    // Bridge content script posts to the page
    window.postMessage({ type: "KINETIC_PING_REQUEST" }, window.location.origin);
    setChecking(false);
  }, []);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      const data = event.data as ExtHello | undefined;
      if (data?.source === "kinetic-extension" && data.type === "KINETIC_HELLO") {
        setInstalled(data);
        setChecking(false);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    void api<InstallConfig>("/api/extension/install")
      .then((data) => {
        setConfig(data);
        setStoreUrlDraft(data.storeUrl || "");
        setExtensionIdDraft(data.extensionId || "");
        return detect(data.extensionId);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, [detect]);

  async function saveStoreConfig(e: FormEvent) {
    e.preventDefault();
    setSaveStatus(null);
    setError(null);
    try {
      await api("/api/org", {
        method: "PATCH",
        body: JSON.stringify({
          settings: {
            chromeExtensionStoreUrl: storeUrlDraft.trim(),
            chromeExtensionId: extensionIdDraft.trim(),
          },
        }),
      });
      setSaveStatus("Chrome install link saved. Team members can Add to Chrome below.");
      const next = await api<InstallConfig>("/api/extension/install");
      setConfig(next);
      await detect(next.extensionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  const storeReady = Boolean(config?.canOneClickInstall && config.storeUrl);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
        <section className="neo-raised overflow-hidden p-0">
          <div className="border-b border-[var(--line)] bg-[linear-gradient(135deg,#d7efe6_0%,#ffffff_55%)] px-6 py-7">
            <p className="page-kicker">Browser extension</p>
            <h1 className="display mt-1 text-3xl leading-tight">
              Install KINETIC in Chrome
            </h1>
            <p className="mt-2 max-w-xl text-sm text-[var(--neo-muted)]">
              Capture LinkedIn, Sales Nav, Cognism, and Gmail into your workspace —
              installed like any normal Chrome extension, with automatic updates from
              the Chrome Web Store.
            </p>
          </div>

          <div className="space-y-4 px-6 py-5">
            {error ? (
              <p className="rounded-xl bg-[#ffedd5] px-3 py-2 text-sm text-[#c2410c]">
                {error}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              {checking ? (
                <span className="record-chip muted">Checking Chrome…</span>
              ) : installed ? (
                <span className="record-chip">
                  Installed · v{installed.version || config?.version || "—"}
                </span>
              ) : (
                <span className="record-chip muted">Not installed in this browser</span>
              )}
              <span className="record-chip muted">
                Latest package · v{config?.version || "—"}
              </span>
            </div>

            {installed ? (
              <div className="rounded-2xl border border-[#b7d8cb] bg-[var(--accent-soft)] p-4">
                <p className="font-medium">You&apos;re ready.</p>
                <p className="mt-1 text-sm text-[var(--neo-muted)]">
                  Open the KINETIC side panel from the puzzle icon in Chrome, sign
                  in with your CRM email and password, then start capturing on
                  LinkedIn.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="neo-btn"
                    onClick={() => void detect(config?.extensionId || "")}
                  >
                    Recheck
                  </button>
                  {config?.canManage ? (
                    <Link href="/settings?tab=extension" className="neo-btn">
                      Extension settings
                    </Link>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {storeReady ? (
                  <>
                    <a
                      className="neo-btn neo-btn-primary inline-flex items-center justify-center gap-2 px-5 py-3 text-base"
                      href={config!.storeUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ChromeMark />
                      Add to Chrome
                    </a>
                    <p className="text-sm text-[var(--neo-muted)]">
                      Opens the Chrome Web Store. Click <strong>Add to Chrome</strong>,
                      then come back here — we&apos;ll detect the install automatically.
                    </p>
                  </>
                ) : (
                  <div className="rounded-2xl border border-[var(--line)] bg-[#fafcfb] p-4">
                    <p className="font-medium">Add to Chrome is almost ready</p>
                    <p className="mt-1 text-sm text-[var(--neo-muted)]">
                      Chrome only allows one-click install from the Chrome Web Store
                      (not from zip/folder sideloads). An admin needs to publish the
                      listing once, then everyone gets a normal Add to Chrome button
                      with automatic updates.
                    </p>
                    {config?.canManage ? (
                      <p className="mt-2 text-sm text-[var(--neo-muted)]">
                        Use the admin setup below — it takes a few minutes.
                      </p>
                    ) : (
                      <p className="mt-2 text-sm text-[var(--neo-muted)]">
                        Ask a workspace admin to finish Chrome Web Store setup on this
                        page.
                      </p>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  className="neo-btn"
                  onClick={() => void detect(config?.extensionId || "")}
                >
                  I installed it — recheck
                </button>
              </div>
            )}
          </div>
        </section>

        {config?.canManage ? (
          <section className="neo-raised space-y-4 p-5">
            <div>
              <h2 className="record-section-title">Admin · Chrome Web Store</h2>
              <p className="mt-1 text-sm text-[var(--neo-muted)]">
                Publish once, then your team installs with Add to Chrome — no developer
                mode, no folders.
              </p>
            </div>

            <ol className="list-decimal space-y-2 pl-5 text-sm text-[var(--neo-muted)]">
              <li>
                Download the store package:{" "}
                <a className="underline" href={config.downloadUrl}>
                  kinetic-extension.zip
                </a>
              </li>
              <li>
                Open the{" "}
                <a
                  className="underline"
                  href="https://chrome.google.com/webstore/devconsole"
                  target="_blank"
                  rel="noreferrer"
                >
                  Chrome Web Store Developer Dashboard
                </a>{" "}
                → New item → upload the zip (unlisted is fine).
              </li>
              <li>
                Paste the listing URL below (and the extension ID from the store URL if
                it differs after publish).
              </li>
            </ol>

            <form onSubmit={saveStoreConfig} className="space-y-3">
              <label className="block text-sm">
                <span className="text-[var(--neo-muted)]">Chrome Web Store URL</span>
                <input
                  className="neo-input mt-1"
                  type="url"
                  placeholder="https://chrome.google.com/webstore/detail/kinetic/…"
                  value={storeUrlDraft}
                  onChange={(e) => setStoreUrlDraft(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="text-[var(--neo-muted)]">Extension ID</span>
                <input
                  className="neo-input mt-1 font-mono text-xs"
                  placeholder={config.extensionId}
                  value={extensionIdDraft}
                  onChange={(e) => setExtensionIdDraft(e.target.value)}
                />
              </label>
              <button type="submit" className="neo-btn neo-btn-primary">
                Save Add to Chrome link
              </button>
              {saveStatus ? (
                <p className="text-sm text-[var(--accent)]">{saveStatus}</p>
              ) : null}
            </form>

            <p className="text-xs text-[var(--neo-muted)]">
              You can also set{" "}
              <code className="rounded bg-[var(--accent-soft)] px-1">
                NEXT_PUBLIC_CHROME_EXTENSION_STORE_URL
              </code>{" "}
              and{" "}
              <code className="rounded bg-[var(--accent-soft)] px-1">
                NEXT_PUBLIC_CHROME_EXTENSION_ID
              </code>{" "}
              in the server environment.
            </p>
          </section>
        ) : null}

        <section className="neo-raised space-y-3 p-5">
          <h2 className="record-section-title">After installing</h2>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-[var(--neo-muted)]">
            <li>Pin KINETIC from Chrome&apos;s puzzle menu and open the side panel.</li>
            <li>
              Sign in with your KINETIC work email and password in the side panel
              Settings tab.
            </li>
            <li>Visit LinkedIn — the KINETIC button and CRM badges appear automatically.</li>
          </ol>
        </section>
      </div>
  );
}

function ChromeMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <circle cx="12" cy="12" r="3.2" fill="currentColor" />
      <path
        d="M12 3a9 9 0 0 1 7.8 4.5H12"
        stroke="currentColor"
        strokeWidth="1.8"
        fill="none"
      />
    </svg>
  );
}
