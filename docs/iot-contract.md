# IoT data contract

How the website reads the ESP32 firmware (`references/V2_25_Oktober_2026_FIX.ino`) and the Firebase Realtime Database layout (`references/adosistering-default-rtdb-export.json`), and every calculation derived from it.

## Realtime Database layout

```text
/<Region>/                      e.g. MAOS (firmware BASE_PATH)
  region_settings/              batas_kering, batas_basah (written by the website; the firmware reads them every 60 s)
  pump/state                    "ON" | "OFF" - shared pump, written by the firmware
  blocks/<Block_X>/Sprayer_1/   Block_A ... Block_E, one sprayer per block
    control/                    pump_status (bool), mode ("AUTO" | "MANUAL") - written by the website, read by the firmware
    live_data/                  flow_Lmin, moisture_percent, last_updated (firmware, every few seconds); arah_angin (another source)
    history/<DDMMYYYY>/<pushId> one record per finished irrigation session
```

Browsers may read only `region_settings`, `pump/state`, and each sprayer's `live_data` and `control` (see `firebase.rules.json`). `history` is imported by the server through the Admin SDK.

## Fields and units

| Field                           | Unit / type        | Notes                                                                          |
| ------------------------------- | ------------------ | ------------------------------------------------------------------------------ |
| `live_data.flow_Lmin`           | liters per minute  | Pulses / 27 per liter, per elapsed time; `0` while the block's valve is closed |
| `live_data.moisture_percent`    | 0-100 %            | One soil sensor shared by every block of the region                            |
| `live_data.last_updated`        | epoch **seconds**  | Device heartbeat (`time(nullptr)`); below 1.7e9 means the clock is unsynced    |
| `history.starttime` / `endtime` | epoch seconds      | `timestamp` equals `endtime`                                                   |
| `history.duration`              | **seconds**        | `endtime - starttime`                                                          |
| `history.totalVolume`           | liters             | Counted at the block's own flow while the valve was open                       |
| `history.flow_Lmin`             | liters per minute  | Session average = `totalVolume * 60 / duration`                                |
| `history.moisture_percent`      | 0-100 %            | Average over the session                                                       |
| `history.mode`                  | `AUTO` \| `MANUAL` | Copied from `control.mode`                                                     |
| `history.pump_status`           | bool               | Always `false` (written when the session ends)                                 |
| `<DDMMYYYY>` key                | WIB calendar day   | Of `starttime`                                                                 |

The firmware does **not** write `moisture_status`, `total_liter`, or `totalVolume` into `live_data`. Older nodes may still contain them; they are ignored for status and used for volume only if present.

## Calculations on the website

- **Moisture class** (dashboard, history, stored readings): from `moisture_percent` with the firmware's boundaries - below dry is **Kering**, below wet is **Lembab**, otherwise **Basah**. A stored `moisture_status` label is never trusted.
- **Flow** (L/min): `flow_Lmin` as reported, divided by the region `volumeDivider` (default 1). Only for a device that has no flow but keeps a liter counter is it derived from the counter.
- **Running volume** (liters): `flow_Lmin x elapsed minutes`, integrated between updates (`elapsed ms / 60000`, gaps over 15 s are capped).
- **Total volume** shown on the dashboard: stored lifetime volume (sum of session `totalVolume`, divided by `volumeDivider`) plus the running session. When a session's stored volume arrives, the part already counted is subtracted, so nothing is counted twice.
- **Duration**: stored in seconds, shown as minutes and seconds; statistics convert seconds to minutes (`/ 60`).
- **Average flow** in history and statistics: `volume / (duration / 60)` over sessions that have both values.
- **Statistics**: volume is the sum of sessions per WIB bucket; average flow is volume divided by the minutes of those sessions; the moisture chart averages sensor readings.
- **Last watered** (`Terakhir siram`): end of the latest stored session; `Sedang menyiram` while `flow_Lmin > 0`.
- **Last update** (`Terakhir update`): `live_data.last_updated` (WIB display); the stored data stamp is only a fallback before the device has reported.
- **Online/offline**: no heartbeat for 120 s is offline, matching the firmware's own 120 s stale-control fail-safe.
- **Status**: `watering` when `flow_Lmin > 0`; `no-flow` when the pump is commanded on but no water flows; `idle` otherwise.

## Not implemented by the firmware

The firmware only follows `control.pump_status`. `control.mode`, `region_settings.mode_otomatis` and the safety timeouts are stored but nothing on the device acts on them, so "AUTO" does not start or stop irrigation by itself.
