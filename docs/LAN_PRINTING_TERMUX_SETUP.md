# QuickServe LAN Printing Setup Guide

Prepared by: Stanlly - Software Developer Team Lead  
Target: Android Tablet + Termux Print Server  
Version: V1.0.4

## Overview

QuickServe LAN printing uses a lightweight local print proxy named `print-server.js`.

The print proxy runs on a device inside the same local network as the thermal printer. QuickServe sends ESC/POS print data to the proxy through HTTP, and the proxy forwards the raw print data to the Ethernet printer over TCP, usually port `9100`.

For WiFi thermal printers, use the same proxy flow and see `docs/WIFI_PRINTING_TERMUX_SETUP.md`. In QuickServe, WiFi and Ethernet printers are configured as network printers with a print server URL, printer IP address, and printer port.

Typical flow:

```text
QuickServe Browser
  -> HTTP request to print-server.js
  -> Android Tablet running Termux
  -> TCP port 9100
  -> Ethernet thermal printer
```

## Prerequisites

- Android tablet connected to the same WiFi/LAN as the printer
- Ethernet thermal printer connected to the LAN by RJ45
- QuickServe `print-server.js` file
- Printer IP address
- Network access from the Android tablet to the printer

## Step 1 - Install Termux And Node.js

Install Termux from F-Droid. Do not use the old Google Play version because it may have outdated packages.

1. Download and install F-Droid.
2. Open F-Droid.
3. Search for `Termux`.
4. Install Termux.

Open Termux and run:

```bash
pkg update && pkg upgrade -y
pkg install nodejs -y
termux-setup-storage
```

When Android asks for file permission, allow it. This makes the Downloads folder available from Termux.

Confirm Node.js is installed:

```bash
node -v
```

## Step 2 - Get `print-server.js`

Recommended option from QuickServe:

1. Open QuickServe.
2. Go to `Settings -> Printers`.
3. Click `Proxy Script`.
4. Save/download `print-server.js`.

Other transfer options:

- USB transfer from PC to tablet Downloads
- Google Drive
- Email attachment
- Local file sharing app

Recommended folder:

```text
Downloads/print-server.js
```

## Step 3 - Start The Print Server

Open Termux and go to Downloads:

```bash
cd ~/storage/downloads
```

If that folder does not exist, run this once and approve storage permission:

```bash
termux-setup-storage
```

Then start the proxy:

```bash
node print-server.js
```

Expected output:

```text
QuickServe LAN Print Proxy
Listening on: http://0.0.0.0:3001
Endpoint:     POST /print
Health:       GET  /health
```

The tablet is now acting as the QuickServe print proxy.

Optional custom port:

```bash
PORT=3002 node print-server.js
```

## Step 4 - Find The Tablet IP Address

In Termux, run:

```bash
ip route get 8.8.8.8
```

Look for the IP after `src`.

Example:

```text
8.8.8.8 via 192.168.1.1 dev wlan0 src 192.168.1.50
```

Tablet IP:

```text
192.168.1.50
```

Print Server URL:

```text
http://192.168.1.50:3001
```

You can also check:

```bash
ip -4 addr show wlan0
```

## Step 5 - Verify The Print Server

From a browser on the same network, open:

```text
http://192.168.1.50:3001/health
```

Expected response:

```json
{"status":"ok","server":"print-server","port":3001}
```

If this does not load, check:

- Tablet and QuickServe device are on the same network
- Termux is still running
- Android battery optimization is not stopping Termux
- The IP address is correct
- The port is correct

## Step 6 - Configure QuickServe Printer Settings

Open QuickServe and go to:

```text
Settings -> Printers
```

Then:

1. Click `Add Printer`.
2. Select `Interface: Ethernet`.
3. Enter the printer details.

| Field | Example |
| --- | --- |
| Print Server URL | `http://192.168.1.50:3001` |
| Printer IP Address | `192.168.1.100` |
| Printer Port | `9100` |

4. Click `Test Connection`.
5. Confirm the print server is reachable.
6. Assign the printer job, such as `Receipt` or `Kitchen`.
7. Save the printer configuration.

Important: `Test Connection` verifies that QuickServe can reach `print-server.js`. The final print still depends on the tablet being able to reach the printer IP and port `9100`.

## Step 7 - Test Printing

After saving the Ethernet printer:

1. Keep Termux running.
2. Complete a test sale or use a print/reprint button in QuickServe.
3. Confirm the printer receives the print job.

If printing fails but `/health` works, check the printer side:

- Printer IP address
- Printer port, usually `9100`
- Printer and tablet are on the same subnet
- Printer is powered on and online
- RJ45 cable/network switch is working

## Multi-Printer Setup

QuickServe can save multiple Ethernet printer profiles.

Example:

| Printer Name | Printer IP | Common Use |
| --- | --- | --- |
| Receipt Printer | `192.168.1.102` | Payment receipts |
| Kitchen Printer | `192.168.1.100` | Kitchen/order list printing |
| Drink Printer | `192.168.1.101` | Beverage station |

Recommended setup:

1. Add each printer separately.
2. Use the same `Print Server URL` if all printers are reached through the same Android tablet.
3. Use a different `Printer IP Address` for each physical printer.
4. Assign jobs/categories in each printer profile.
5. Keep the main receipt printer first if using general receipt/order-list print flows.

Current V1.0.4 note: the printer profiles support jobs and kitchen categories, but some general print paths use the first configured Ethernet printer as the fallback LAN target. Always test receipt, order-list, and kitchen workflows after configuring multiple printers.

## Operating Notes

Keep the print server running whenever printing is required.

Recommended:

- Keep Termux open in the background
- Do not close the active Termux session
- Keep the tablet charged
- Disable aggressive battery optimization for Termux if Android stops the process
- Use a stable/static IP for the tablet and printers where possible

Suggested fixed IP setup:

- Reserve the tablet IP in the router DHCP settings
- Reserve each printer IP in the router DHCP settings
- Avoid changing WiFi networks

## Troubleshooting

### QuickServe Cannot Reach Print Server

Check:

```text
http://<tablet-ip>:3001/health
```

If it fails:

- Restart `node print-server.js`
- Confirm tablet IP
- Confirm QuickServe device and tablet are on the same LAN
- Try the browser health URL from another device on the same WiFi

### Print Server Is Reachable But Printer Does Not Print

Check:

- Printer IP address in QuickServe
- Printer port, usually `9100`
- Printer is online
- Tablet can reach the printer
- Printer supports raw ESC/POS over TCP

### Termux Cannot Find Downloads

Run:

```bash
termux-setup-storage
cd ~/storage/downloads
ls
```

If needed, use Android file manager to confirm `print-server.js` is in Downloads.

### Server Already Uses Port 3001

Use another port:

```bash
PORT=3002 node print-server.js
```

Then configure QuickServe with:

```text
http://<tablet-ip>:3002
```

## Final Workflow

```text
User completes sale/order in QuickServe
  -> QuickServe builds ESC/POS print data
  -> Browser sends data to http://<tablet-ip>:3001/print
  -> Termux print-server.js receives the job
  -> print-server.js opens TCP connection to <printer-ip>:9100
  -> Thermal printer prints automatically
```

