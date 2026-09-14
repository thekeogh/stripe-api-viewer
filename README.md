# Stripe API Viewer

A personal, read-only Stripe API explorer. Choose a resource and method, send a request, and inspect the raw response in a Monaco JSON viewer.

## Run locally

Requires Node.js 22.13+ and pnpm.

```sh
pnpm install
pnpm start
```

Your default browser opens **https://localhost:4387** automatically when the server is ready. The start script runs Next.js with `--experimental-https` and binds to localhost. On first launch, Next.js generates a local certificate; you may be prompted to trust it. If your browser warns about the certificate, trust it for this local app. To use another port, change `4387` in `package.json`. Set `BROWSER=none` to skip opening the browser.

## Use it

1. Paste a Stripe secret key (`sk_test_…` / `sk_live_…`) or restricted key (`rk_…`) with permission to read the resources you need.
2. Select a resource, then **List all**, **Retrieve**, or **Search** where supported. Fill in the resource ID or search query when prompted.
3. Click **Send request** (or press **⌘/Ctrl + Enter**).

Supports customers, subscriptions, products, prices, coupons, promotion codes, invoices, payment intents, charges, refunds, disputes, checkout sessions, balance, balance transactions, payouts, and events.

- The workspace fills the browser between the header and footer. The fixed-width request panel scrolls independently, and the JSON viewer fills the remaining space. Narrow windows scroll horizontally to keep both panels usable.
- The footer is a status bar: connection state, orange test mode or purple live mode, read-only status, last-request status/timing, and saved settings. Connection turns green after a successful request; a new or changed connection shows **Not verified** until you send one.
- The JSON viewer includes syntax highlighting, folding, search, a minimap, word wrap, bracket guides, an expanded view, and copy/download buttons. Press **Escape** to exit the expanded view.
- List and search results are paginated, with 1–100 objects per page. Use **Next page** for more results and **First page** to start over.
- Collapse **Connection** to tuck away your saved key. Both its open/closed state and the nested **More options** accordion are remembered.
- **Connection → More options** contains a pagination cursor, a connected account ID, an API version override, and additional query parameters. Leave the API version blank to use your account’s default.
- Additional parameters use one unencoded `key=value` per line, such as `customer=cus_…` or `expand[]=data.customer`. Only use parameters supported by the selected endpoint; its reference is linked below the form. Repeated keys are supported.
- Form values (including the API key), values for each resource/method, and viewer preferences are stored in this browser’s localStorage. **Forget** clears the saved key. Responses are not saved across reloads.
- Stripe errors appear as JSON with the original HTTP status and request ID. Search uses [Stripe’s query syntax](https://docs.stripe.com/search#search-query-language); newly changed data may take time to become searchable.

Requests pass through your local Next.js server to avoid browser CORS restrictions. The server only calls allowlisted Stripe endpoints using **GET**, even though the browser sends the local proxy a POST. The key is stored unencrypted in your browser and sent to the local server and Stripe; it is not written to a server-side file. This is a personal localhost tool, with no user accounts or authentication.

Monaco is served locally from the installed package and uses Ubuntu Sans Mono. Fonts (Ubuntu Sans Mono, DM Sans, and JetBrains Mono) load from Google Fonts, so an internet connection is needed for fonts as well as Stripe requests.

## Other commands

```sh
pnpm typecheck  # Check TypeScript
pnpm build      # Verify a production build
```

Built with Next.js, React, TypeScript, and Monaco. Endpoint definitions follow [Stripe’s API reference](https://docs.stripe.com/api); local HTTPS uses [Next.js’s HTTPS option](https://nextjs.org/docs/app/api-reference/cli/next#using-https-during-development).
