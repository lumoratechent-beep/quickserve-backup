# SUNMI V2 Integration

QuickServe supports the SUNMI V2/V2 Pro/V2s built-in 58mm printer through a browser/WebView bridge.

## What Is Implemented

- Printer model presets: `SUNMI V2 Built-in`, `SUNMI V2 Pro Built-in`, and `SUNMI V2s Built-in`.
- New printer interface: `SUNMI`.
- Receipt, order-list, kitchen-ticket, shift-close, drawer, and beep commands all use the same ESC/POS output pipeline.
- The POS detects common bridge objects: `QuickServeSunmi`, `SunmiPrinter`, `sunmiPrinter`, `SunmiPrint`, `sunmiPrint`, `WoyouPrinter`, `woyouPrinter`, `Android`, and `android`.
- The preferred bridge method is `printEscPosBase64(base64)`.
- Compatible raw methods are also supported: `printRawBase64`, `printBase64`, `sendRawBase64`, `runRAWData`, `sendRAWData`, `sendRawData`, and `printRawData`.

## Required SUNMI Wrapper

A normal web browser cannot reliably access the SUNMI built-in printer directly. SUNMI documents the printer paths as Android AIDL/service, virtual Bluetooth, or an H5 page through a JS bridge. For this React POS, the recommended deployment is an Android WebView wrapper on the SUNMI device.

The wrapper should expose this JavaScript object:

```js
window.QuickServeSunmi.printEscPosBase64(base64EscPosBytes)
```

Optional methods:

```js
window.QuickServeSunmi.printerInit()
window.QuickServeSunmi.initPrinter()
window.QuickServeSunmi.isReady()
window.QuickServeSunmi.getServiceVersion()
```

Accepted success responses:

```js
true
"true"
"ok"
"success"
{ "success": true }
{ "ok": true }
{ "code": 0 }
```

## Native Wrapper Notes

On Android, bind to SUNMI's printer service or use SUNMI's printer library, then decode the base64 payload and pass the raw ESC/POS bytes to the printer. The GitHub examples and SUNMI docs call this kind of method `sendRAWData` or `runRAWData`.

Minimum native behavior:

1. Load the QuickServe URL in a WebView.
2. Enable JavaScript.
3. Add a JavaScript interface named `QuickServeSunmi`.
4. Implement `printEscPosBase64(String base64)` to decode and send raw bytes to the built-in printer.
5. Implement `printerInit()` if available from the SUNMI library.

## Device Setup

1. Open QuickServe on the SUNMI wrapper app.
2. Go to POS settings, then Printer.
3. Add printer.
4. Set Interface to `SUNMI`.
5. Select `SUNMI V2 Built-in` or the matching V2 model.
6. Press `Connect Built-in Printer`.
7. Save the printer profile.
8. Run `Test Print`.

## Fallback

External Bluetooth receipt printers still use the existing Web Bluetooth flow. The SUNMI built-in printer should use the SUNMI interface, not the Bluetooth interface, unless your wrapper intentionally exposes the internal printer as a BLE-compatible device.
