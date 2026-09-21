# Stripe API Viewer

A personal Stripe API workbench with separate **Reads** and **Writes** tabs, saved drafts, and Monaco JSON editors.

## Run locally

Requires Node.js 22.13+ and pnpm.

```sh
pnpm install
pnpm start
```

Your default browser opens **https://localhost:4387** when the server is ready. Next.js uses `--experimental-https` and binds to localhost. On first launch, you may need to trust its local certificate. Change `4387` in `package.json` to use another port. Set `BROWSER=none` to skip opening the browser.

## Connection and reads

Paste a Stripe secret or restricted key into **Connection**. This connection is shared by both tabs. Collapse the accordion to tuck it away; **More options** contains the connected account and API version (blank uses your account’s default). In Reads it also includes pagination cursors.

Choose a resource and read method, then send a request. IDs and search queries appear when needed. List/search results support 1–100 objects per page and **Next page / First page** controls.

**Expand options**, below the read endpoint form, accepts one expansion path per row. Press Enter or use **Add expansion** to add a row; use its × button to remove it. Enter paths such as `customer` or `data.customer`, not `expand[]=...` or comma-separated lists. Rows are remembered per resource/method, along with the accordion’s open/closed preference. Blank rows are ignored and duplicates are sent only once. See [Stripe’s expansion guide](https://docs.stripe.com/expand) for supported nesting and list expansion. Previously saved `expand[]` parameters are migrated; other generic additional parameters are no longer sent. Write expansions can still be supplied in the JSON body.

Reads cover customers, subscriptions, products, prices, coupons, promotion codes, invoices, payment intents, charges, refunds, disputes, checkout sessions, balance, balance transactions, payouts, and events. [Stripe search syntax](https://docs.stripe.com/search#search-query-language) applies to Search; recent changes may take time to appear.

### Read tabs

Use **+** in the response editor’s tab bar to open a blank request tab. Tabs and editor tools share one toolbar, directly above the JSON. Each tab remembers its endpoint form, expansions, pagination, viewer preferences, and latest response—including the JSON body and status—across refreshes and browser restarts. The API key, connected account, and API version remain shared. Your existing read form becomes the first tab when upgrading.

Tab labels follow the resource and object ID. Switch tabs to compare responses without sending anything; requests can finish in the background in their original tab. **×** closes a tab and permanently removes its saved form and response. Closing the last tab leaves one blank tab. Use Left/Right or Home/End on the tab bar to switch tabs, and Delete to close one.

Read tabs and response bodies are saved locally in IndexedDB, without copying the API key into each tab. The footer shows saving errors; use **Retry saving tabs** if storage fills up or fails. Wait for saving to finish before closing the browser. **Reset everything** also deletes all read tabs.

## Writes

Select **Writes**, choose a resource/action, and edit the request JSON. Supported actions are create, update, delete, and cancel where Stripe offers them; balance, balance transactions, and events remain in Reads only. Some Stripe actions, such as capture or invoice finalization, are not included.

For a product without a price, choose **Products → Create** and send:

```json
{
  "name": "Arc Enterprise Unlimited"
}
```

Requests use JSON objects, including nested objects and arrays. The app translates these into Stripe’s form encoding. Use an empty string to clear a supported field; JSON `null` is rejected. Delete bodies must be `{}`. New request bodies start empty; **Load example** inserts a starter body. Examples contain placeholder IDs where needed—replace them with your own. Refer to the linked endpoint documentation for fields supported by your API version.

The editable request pane sits above the read-only response. Drag the divider, or focus it and use the arrow keys, to resize the panes. **⌘/Ctrl + Enter** submits from either workspace; it never bypasses a confirmation dialog.

Paste a JavaScript-style object into the request editor and click **Convert to JSON** to quote keys, remove comments and trailing commas, and apply two-space indentation. Expressions such as `input.company` become ordinary strings; numbers, booleans, and null stay their original types. Conversion happens locally without executing code or sending a request, and **⌘/Ctrl+Z** undoes it. Unsupported structures (such as spreads or computed keys) and invalid syntax leave your text unchanged with an error.

| Action          | Test mode     | Live mode                          |
| --------------- | ------------- | ---------------------------------- |
| Read            | Immediate     | Immediate                          |
| Create / update | Immediate     | Review dialog + type `LIVE`        |
| Delete / cancel | Review dialog | Review dialog + type the target ID |

Live writes have a persistent warning. Dialogs show the action, endpoint, account, target, and exact body, and require an acknowledgement checkbox. The server checks the key’s mode and requires a single-use approval bound to the exact request; approvals expire after five minutes. Confirmations are never saved. A refresh never sends a write.

### Every submit is a new request

Writes do **not** send a Stripe `Idempotency-Key` header. Every submit makes a fresh request, even with identical fields, after refreshing, or when loading an old history entry. Old saved operation keys are ignored. Repeated submits can create duplicate objects or repeat charges; Stripe’s normal endpoint validation still applies.

There are no automatic retries. After a timeout or network error, check Stripe before submitting again: the previous write may already have completed. Live-mode and destructive-action confirmations remain in place, and the UI blocks simultaneous submits while a request is in progress.

### Write history

Click **History** at the top right of Writes to open the animated sidebar. Its open/closed state, collapsed resource groups, and selected entry are remembered. Every submitted write attempt is saved in IndexedDB, including failures; cancelled confirmations and unsent drafts are not recorded. History starts with requests sent after this feature was added.

Entries are grouped by resource, newest first, with the action, test/live mode, result, and timestamp. Default names include the action and object ID or name (for example, **Update subscription · sub\_…**); use the pencil button to rename an entry. **Load older requests** retrieves more without loading all request bodies into memory.

Select an entry to restore its resource, action, object ID, JSON body, account, and API version. Loading never sends it, changes your API key, or bypasses confirmations. Submitting a loaded entry always sends a fresh request, without reusing any old operation key.

Use an entry’s trash button to delete it, or **Delete all** to wipe the entire saved history, including older entries. Both ask for confirmation and permanently remove local history only—not Stripe objects. Your current form and connection settings remain unchanged.

History stores request bodies and result metadata, not response bodies, API keys, or confirmation tokens. It stays in this browser and is removed if you clear this site’s data. If a request cannot be recorded, it is not sent. **Unverified** means no final result was recorded; check Stripe before retrying.

## Workspace

Use the **sun/moon button** in the header to switch between light and dark themes. Your choice is remembered across refreshes and browser restarts; Monaco keeps its dark editor palette in both. Reset everything restores the default light theme.

The red **Reset everything** button in the header returns the app to a fresh state. Type **RESET** to permanently erase connection settings, all drafts and request bodies, history, legacy operation keys, and UI preferences. **Keep API key** is checked every time the dialog opens: only the API key is retained. Uncheck it to delete the key too. The reset clears localStorage (except the retained key), sessionStorage, IndexedDB, and Cache Storage for this app’s address, then reloads. Other open app tabs pause and reload after completion; close them if a database connection blocks the reset. This does not change Stripe data or undo requests already sent. Fresh write request bodies start empty.

- Reads and Writes keep separate selections and drafts. Read tabs, their forms, and responses persist in IndexedDB. Shared connection settings, write drafts, and write viewer preferences persist in localStorage; write responses do not survive refresh.
- **Forget** clears the shared API key. Keys and drafts are stored unencrypted locally. Writes pause if their settings cannot be saved.
- Monaco includes syntax highlighting, folding, search, minimap, word wrap, and copy/download controls. The response can expand; **Escape** exits.
- The fixed-width sidebar scrolls independently. The footer shows connection state, test/live mode, read/write workspace, latest response status/timing, and saved settings. Green connection status follows a successful request in the current workspace.
- Monaco is served locally and uses Ubuntu Sans Mono. Fonts load from Google Fonts.

Requests pass through the local Next.js server to Stripe. The Reads route is GET-only; the separate Writes route permits only its supported endpoints/actions. This is a personal localhost tool without user accounts or authentication. Its confirmation dialogs protect against accidental actions in the UI; do not expose the server publicly.

## Other commands

```sh
pnpm typecheck
pnpm build
```

Built with Next.js, React, TypeScript, and Monaco. See the [Stripe API reference](https://docs.stripe.com/api) and [Next.js HTTPS documentation](https://nextjs.org/docs/app/api-reference/cli/next#using-https-during-development).
