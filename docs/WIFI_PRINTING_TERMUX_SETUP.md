# QuickServe WiFi Printing Setup Guide

Prepared by: Stanlly - Software Developer Team Lead  
Target: WiFi Thermal Printer + Android Termux Print Server  
Version: V1.0.0

## Overview

QuickServe WiFi printing uses the same print proxy as LAN/Ethernet printing:

```text
QuickServe Browser/POS
  -> HTTP request to print-server.js
  -> Android device running Termux
  -> WiFi thermal printer IP on port 9100
```

The printer can be connected by WiFi instead of RJ45 cable. The important part is that the POS device, the Termux print proxy device, and every printer are on the same WiFi/router network.

## When To Use WiFi Printing

Use WiFi printing when:

- The printer has built-in WiFi support
- The printer can join the same WiFi as the POS tablet
- The printer supports ESC/POS raw TCP printing, usually port `9100`
- You want multiple POS devices to print through one shared print proxy
- You want order routing to receipt, kitchen, drinks, or department printers

Recommended for stability:

- Use a strong WiFi signal near each printer
- Reserve fixed IP addresses in the router for the Termux device and printers
- Keep Termux running whenever printing is needed

## Required Devices

```text
1 Android phone/tablet running Termux print-server.js
1 or more WiFi thermal printers
1 or more POS phones/tablets using QuickServe
Same WiFi/router for all devices
```

The Termux device can be the same tablet as the POS, or a dedicated phone/tablet.

## Step 1 - Connect The Printer To WiFi

Connect the thermal printer to the restaurant WiFi using the printer's setup method.

Common options:

- Printer WiFi setup button or printer menu
- Vendor Android/iOS setup app
- Vendor Windows setup tool
- Printer temporary hotspot setup
- Router WPS, if supported

After setup, print a self-test/config page and confirm the printer has an IP address.

## Step 2 - Get The WiFi Printer IP

Most thermal printers can print a self-test page:

1. Turn off the printer.
2. Hold the `FEED` button.
3. Turn on the printer while still holding `FEED`.
4. Release after 3-5 seconds.
5. Check the printed config paper.

Look for:

```text
IP Address
Local IP
Wireless IP
WiFi IP
```

Example:

```text
Printer IP Address: 192.168.1.120
Printer Port: 9100
```

If no IP is shown, check the router connected device list. The printer may appear as `POS Printer`, `Thermal Printer`, `EPSON`, `XPrinter`, `Gprinter`, or `Unknown Device`.

## Step 3 - Start The Termux Print Server

On the Android device that will act as the print proxy:

```bash
cd ~/storage/downloads
node print-server.js
```

Expected output:

```text
QuickServe LAN Print Proxy
Listening on: http://0.0.0.0:3001
Endpoint:     POST /print
Health:       GET  /health
```

Even for WiFi printers, the same `print-server.js` is used.

## Step 4 - Get The Termux Device IP

In Termux, run:

```bash
ip route get 8.8.8.8
```

Look for the IP after `src`.

Example:

```text
8.8.8.8 via 192.168.1.1 dev wlan0 src 192.168.1.50
```

Termux device IP:

```text
192.168.1.50
```

Print Server URL:

```text
http://192.168.1.50:3001
```

If QuickServe POS is on the same device as Termux, you can also use:

```text
http://127.0.0.1:3001
```

For other phones/tablets, use the Termux device LAN IP, not `127.0.0.1`.

## Step 5 - Verify The Print Server

From the POS phone/tablet browser, open:

```text
http://192.168.1.50:3001/health
```

Expected response:

```json
{"status":"ok","server":"print-server","port":3001}
```

If this does not load, check:

- POS device and Termux device are on the same WiFi
- Termux is still running
- The Termux device IP is correct
- Android battery optimization is not stopping Termux
- Port `3001` is not blocked by the network/router

## Step 6 - Configure A WiFi Printer In QuickServe

Open QuickServe:

```text
Settings -> Printers -> Add Printer
```

Use:

```text
Interface: WiFi / LAN
Print Server URL: http://<termux-device-ip>:3001
Printer IP Address: <wifi-printer-ip>
Printer Port: 9100
```

Example:

```text
Interface: WiFi / LAN
Print Server URL: http://192.168.1.50:3001
Printer IP Address: 192.168.1.120
Printer Port: 9100
```

Click `Test Connection`. This checks that QuickServe can reach the Termux print server. The final print still depends on the Termux device being able to reach the WiFi printer IP and port `9100`.

Save the printer profile after the connection test.

## WiFi Printer Config Example

QuickServe saves WiFi/LAN printers using `connectionType: "wifi"`.

Example receipt printer profile:

```json
{
  "name": "Receipt WiFi Printer",
  "connectionType": "wifi",
  "printServerUrl": "http://192.168.1.50:3001",
  "ipAddress": "192.168.1.120",
  "printerPort": 9100,
  "paperSize": "80mm",
  "printJobs": ["receipt"],
  "kitchenCategories": [],
  "numberOfCopies": 1
}
```

Example kitchen printer profile:

```json
{
  "name": "Kitchen WiFi Printer",
  "connectionType": "wifi",
  "printServerUrl": "http://192.168.1.50:3001",
  "ipAddress": "192.168.1.121",
  "printerPort": 9100,
  "paperSize": "80mm",
  "printJobs": ["kitchen"],
  "kitchenCategories": ["Food", "Noodles", "Rice"],
  "numberOfCopies": 1
}
```

## Multiple WiFi Printers And Order Routing

You can add multiple WiFi printers. Use the same `Print Server URL`, but a different `Printer IP Address` for each printer.

Example:

| Printer Name | Print Server URL | Printer IP | Job |
| --- | --- | --- | --- |
| Receipt Printer | `http://192.168.1.50:3001` | `192.168.1.120` | Receipt |
| Kitchen Printer | `http://192.168.1.50:3001` | `192.168.1.121` | Kitchen/Food |
| Drink Printer | `http://192.168.1.50:3001` | `192.168.1.122` | Kitchen/Drinks |

Routing setup:

1. Add each printer separately.
2. Choose `Interface: WiFi / LAN`.
3. Enter the same Termux `Print Server URL`.
4. Enter each printer's own WiFi IP.
5. Assign `Receipt` or `Kitchen` print jobs.
6. For kitchen printers, assign categories or departments where available.
7. Test receipt, order-list, and kitchen ticket workflows.

## Is WiFi Easier Than Ethernet?

WiFi is usually easier to place because no RJ45 cable is needed.

Ethernet is usually more stable because it does not depend on WiFi signal strength.

Recommended production setup:

```text
Cashier/receipt printer: Ethernet if possible
Kitchen printer: Ethernet if possible
Moveable/temporary printer: WiFi is acceptable
Multiple POS devices: WiFi/LAN print proxy is recommended
```

## Troubleshooting

### QuickServe Cannot Reach Print Server

Open this from the POS device:

```text
http://<termux-device-ip>:3001/health
```

If it fails:

- Confirm Termux is running
- Confirm the Termux IP using `ip route get 8.8.8.8`
- Confirm POS and Termux device are on the same WiFi
- Disable mobile data temporarily and test again
- Disable battery optimization for Termux

### Print Server Works But Printer Does Not Print

Check:

- Printer is connected to the same WiFi/router
- Printer IP is correct
- Printer port is `9100`
- Printer supports raw ESC/POS over TCP
- Printer is powered on and online
- WiFi signal near printer is strong

### Printer IP Keeps Changing

Reserve fixed IP addresses in the router DHCP settings.

Recommended:

```text
Termux device: 192.168.1.50
Receipt printer: 192.168.1.120
Kitchen printer: 192.168.1.121
Drink printer: 192.168.1.122
```

## Final Workflow

```text
User completes sale/order in QuickServe
  -> QuickServe builds ESC/POS print data
  -> Browser sends data to http://<termux-device-ip>:3001/print
  -> Termux print-server.js receives the job
  -> print-server.js sends raw TCP data to <wifi-printer-ip>:9100
  -> WiFi thermal printer prints automatically
```
