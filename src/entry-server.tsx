// @refresh reload
import { createHandler, StartServer } from "@solidjs/start/server";

export default createHandler(() => (
  <StartServer
    document={({ assets, children, scripts }) => (
      <html lang="id">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          {assets}
        </head>
        <body>
          <noscript>
            <div style="position:fixed;inset:0;z-index:9999;background:#0d1f0d;color:#f1f5f9;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding:2rem 1rem;overflow-y:auto;min-height:100vh">
              <div style="width:100%;max-width:600px;margin:2rem auto 0">
                <div style="text-align:center;margin-bottom:2.5rem">
                  <div style="display:inline-flex;align-items:center;justify-content:center;width:72px;height:72px;background:#67B744;border-radius:18px;margin-bottom:1rem">
                    <svg
                      width="36"
                      height="36"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#fff"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path d="M12 2a5.5 5.5 0 0 0-3.9 9.4L12 22l3.9-10.6A5.5 5.5 0 0 0 12 2z" />
                    </svg>
                  </div>
                  <h1 style="font-size:1.75rem;font-weight:700;color:#67B744;letter-spacing:0.05em;margin:0 0 0.25rem">
                    ADOSISTERING
                  </h1>
                  <p style="font-size:0.875rem;color:#94a3b8;margin:0">Sistem Irigasi Cerdas Berbasis IoT</p>
                </div>
                <div style="background:#1a2e1a;border:1px solid #2d4a2d;border-radius:16px;padding:2rem;margin-bottom:1.5rem">
                  <div style="display:flex;align-items:flex-start;gap:1rem;margin-bottom:1.5rem">
                    <div style="flex-shrink:0;width:44px;height:44px;background:#dc2626;border-radius:10px;display:flex;align-items:center;justify-content:center">
                      <svg
                        width="22"
                        height="22"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#fff"
                        stroke-width="2.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                        <line x1="12" y1="9" x2="12" y2="13" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                      </svg>
                    </div>
                    <div>
                      <h2 style="font-size:1.25rem;font-weight:700;color:#f1f5f9;margin:0 0 0.5rem">
                        JavaScript Tidak Aktif
                      </h2>
                      <p style="font-size:0.875rem;color:#94a3b8;line-height:1.6;margin:0">
                        Aplikasi ADOSISTERING membutuhkan JavaScript untuk menampilkan data sensor secara real-time,
                        mengelola irigasi, dan mengakses fitur dashboard. Silakan aktifkan JavaScript di browser Anda.
                      </p>
                    </div>
                  </div>
                  <div style="border-top:1px solid #2d4a2d;padding-top:1.5rem">
                    <p style="font-size:0.6875rem;font-weight:600;color:#67B744;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 1rem">
                      Cara Mengaktifkan JavaScript
                    </p>
                    <div style="display:grid;gap:0.75rem">
                      <div style="background:#0f1f0f;border-radius:10px;padding:0.875rem 1rem">
                        <p style="font-size:0.8125rem;font-weight:600;color:#e2e8f0;margin:0 0 0.25rem">
                          Google Chrome
                        </p>
                        <p style="font-size:0.75rem;color:#64748b;margin:0">
                          Setelan &#8594; Privasi &amp; Keamanan &#8594; Setelan Situs &#8594; JavaScript &#8594;
                          Izinkan semua situs
                        </p>
                      </div>
                      <div style="background:#0f1f0f;border-radius:10px;padding:0.875rem 1rem">
                        <p style="font-size:0.8125rem;font-weight:600;color:#e2e8f0;margin:0 0 0.25rem">
                          Mozilla Firefox
                        </p>
                        <p style="font-size:0.75rem;color:#64748b;margin:0">
                          Ketik{" "}
                          <span style="background:#1a2e1a;padding:0.1em 0.4em;border-radius:4px;font-family:monospace;font-size:0.7rem">
                            about:config
                          </span>{" "}
                          di address bar &#8594; cari{" "}
                          <span style="background:#1a2e1a;padding:0.1em 0.4em;border-radius:4px;font-family:monospace;font-size:0.7rem">
                            javascript.enabled
                          </span>{" "}
                          &#8594; set ke true
                        </p>
                      </div>
                      <div style="background:#0f1f0f;border-radius:10px;padding:0.875rem 1rem">
                        <p style="font-size:0.8125rem;font-weight:600;color:#e2e8f0;margin:0 0 0.25rem">Safari</p>
                        <p style="font-size:0.75rem;color:#64748b;margin:0">
                          Menu Safari &#8594; Preferensi &#8594; Keamanan &#8594; centang "Aktifkan JavaScript"
                        </p>
                      </div>
                      <div style="background:#0f1f0f;border-radius:10px;padding:0.875rem 1rem">
                        <p style="font-size:0.8125rem;font-weight:600;color:#e2e8f0;margin:0 0 0.25rem">
                          Microsoft Edge
                        </p>
                        <p style="font-size:0.75rem;color:#64748b;margin:0">
                          Setelan &#8594; Cookie &amp; izin situs &#8594; JavaScript &#8594; Izinkan
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                <div style="text-align:center;margin-bottom:2rem">
                  <a
                    href="?"
                    style="display:inline-flex;align-items:center;gap:0.5rem;background:#67B744;color:#fff;font-size:0.9375rem;font-weight:600;padding:0.875rem 2rem;border-radius:12px;text-decoration:none"
                  >
                    &#8635; Muat Ulang Halaman
                  </a>
                </div>
                <p style="text-align:center;font-size:0.75rem;color:#475569;padding-bottom:2rem">
                  Jika masalah berlanjut setelah mengaktifkan JavaScript, coba bersihkan cache browser atau gunakan
                  browser versi terbaru.
                </p>
              </div>
            </div>
          </noscript>
          <div id="app">{children}</div>
          {scripts}
        </body>
      </html>
    )}
  />
));
