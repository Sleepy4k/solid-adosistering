// @refresh reload
import { createHandler, StartServer } from "@solidjs/start/server";

export default createHandler(() => (
  <StartServer
    document={({ assets, children, scripts }) => (
      <html lang="id">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <link rel="icon" href="/favicon.ico" />
          {assets}
        </head>
        <body>
          <noscript>
            <div
              style="background:#1a2e1a;color:#ffffff;padding:12px 16px;text-align:center;font-size:14px;font-weight:600;letter-spacing:0.01em"
            >
              JavaScript diperlukan untuk menjalankan aplikasi ADOSISTERING. Silakan aktifkan JavaScript di browser Anda.
            </div>
          </noscript>
          <div id="app">{children}</div>
          {scripts}
        </body>
      </html>
    )}
  />
));
