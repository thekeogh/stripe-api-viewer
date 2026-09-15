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

| Action          | Test mode     | Live mode                          |
| --------------- | ------------- | ---------------------------------- |
| Read            | Immediate     | Immediate                          |
| Create / update | Immediate     | Review dialog + type `LIVE`        |
| Delete / cancel | Review dialog | Review dialog + type the target ID |

Live writes have a persistent warning. Dialogs show the action, endpoint, account, target, and exact body, and require an acknowledgement checkbox. The server checks the key’s mode and requires a single-use approval bound to the exact request; approvals expire after five minutes. Confirmations are never saved. A refresh never sends a write.

### Duplicate protection

POST requests use a saved **operation key** ([Stripe idempotency](https://docs.stripe.com/api/idempotent_requests)). Re-sending the unchanged request reuses its key, including after refresh. Formatting JSON or reordering object properties keeps the same key. Changing request values or the connection starts a different operation on the next send. Use **New operation** only if you intend to perform the same write again—for example, creating a second identical product.

There are no automatic retries. After a timeout or network error, check Stripe: the write may already have completed. Keep the same key when retrying a POST. Keys older than 23 hours require reviewing Stripe and explicitly starting a new operation. Stripe does not deduplicate DELETE requests using these keys.

### Write history

Click **History** at the top right of Writes to open the animated sidebar. Its open/closed state, collapsed resource groups, and selected entry are remembered. Every submitted write attempt is saved in IndexedDB, including failures; cancelled confirmations and unsent drafts are not recorded. History starts with requests sent after this feature was added.

Entries are grouped by resource, newest first, with the action, test/live mode, result, and timestamp. Default names include the action and object ID or name (for example, **Update subscription · sub\_…**); use the pencil button to rename an entry. **Load older requests** retrieves more without loading all request bodies into memory.

Select an entry to restore its resource, action, object ID, JSON body, account, and API version. Loading never sends it, changes your API key, or bypasses confirmations. The original operation key is restored, so the existing retry protections still apply when using the same connection. Use **New operation** deliberately if you want to send it as a new write.

Use an entry’s trash button to delete it, or **Delete all** to wipe the entire saved history, including older entries. Both ask for confirmation and permanently remove local history only—not Stripe objects. Your current form, connection settings, and retry protections remain unchanged.

History stores request bodies and result metadata, not response bodies, API keys, or confirmation tokens. It stays in this browser and is removed if you clear this site’s data. If a request cannot be recorded, it is not sent. **Unverified** means no final result was recorded; check Stripe before retrying.

## Workspace

The red **Reset everything** button in the header returns the app to a fresh state. Type **RESET** in the confirmation dialog to permanently erase the saved API key, connection settings, all drafts and request bodies, history, operation keys, and UI preferences. It clears localStorage, sessionStorage, IndexedDB, and Cache Storage for this app’s address, then reloads. Other open app tabs pause and reload after completion; close them if a database connection blocks the reset. This does not change Stripe data or undo requests already sent. Retry protections from previous operations are lost. Fresh write request bodies start empty.

- Each tab keeps its own selections, drafts, and responses while switching. Form settings, write operation keys, viewer preferences, the selected tab, and divider position persist in this browser’s localStorage; responses do not survive refresh.
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
