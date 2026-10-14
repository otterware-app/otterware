# Browser extensions

Browser tabs rendered locally by the desktop app run Chrome extensions, such as a password manager.
Previews streamed from a remote environment do not provide these extension controls.

Add one from the Chrome Web Store: open the puzzle button in a browser tab's toolbar and choose
**Visit Web Store**, or use **Settings → Browser Extensions → Chrome Web Store**. On an
extension's page, choose **Add to** the app and confirm. Pin an extension from the puzzle menu to
keep its button in the toolbar; its popup opens from there.
The Web Store opened from Settings always uses a local desktop window, including while you work
in a remote thread.

**Settings → Browser Extensions** turns extensions on or off, shows what each can read, and
removes them. Developer mode loads an unpacked extension from a folder.

Extensions are installed once for every thread, but each environment and browser profile keeps its
own extension data, as it keeps its own site logins. Sign in to an extension once per environment.
Incognito tabs run no extensions.

On Mac and Linux, extensions can connect to installed desktop apps. To connect 1Password on Mac,
add your installed Otterware app in **1Password → Settings → Browser → Add Browser**. The extension then shares the
desktop app's unlock, including Touch ID. Each browser profile keeps its own extension connection.

In Mail, **Settings → Mail → Browser** controls where links open and manages the same installed
extensions. Links opened in Mail use a separate browser profile for the selected environment.
Pin 1Password from the puzzle menu in a Mail browser tab, then connect it to the installed app
through 1Password's browser settings. Browser extensions require the desktop app.
