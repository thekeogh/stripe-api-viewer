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

Paste a Stripe secret or restricted key into **Connection**. This connection is shared by both tabs. Collapse the accordion to tuck it away; **More options** contains the connected account and API version (blank uses your account’s default). In Reads it also includes pagination cursors and additional query parameters, one unencoded `key=value` per line.

Choose a resource and read method, then send a request. IDs and search queries appear when needed. List/search results support 1–100 objects per page and **Next page / First page** controls.

Reads cover customers, subscriptions, products, prices, coupons, promotion codes, invoices, payment intents, charges, refunds, disputes, checkout sessions, balance, balance transactions, payouts, and events. [Stripe search syntax](https://docs.stripe.com/search#search-query-language) applies to Search; recent changes may take time to appear.

## Writes

Select **Writes**, choose a resource/action, and edit the request JSON. Supported actions are create, update, delete, and cancel where Stripe offers them; balance, balance transactions, and events remain in Reads only. Some Stripe actions, such as capture or invoice finalization, are not included.

For a product without a price, choose **Products → Create** and send:

```json
{
  "name": "Arc Enterprise Unlimited"
}
```

Requests use JSON objects, including nested objects and arrays. The app translates these into Stripe’s form encoding. Use an empty string to clear a supported field; JSON `null` is rejected. Delete bodies must be `{}`. Examples contain placeholder IDs where needed—replace them with your own. Refer to the linked endpoint documentation for fields supported by your API version.

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

## Workspace

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
