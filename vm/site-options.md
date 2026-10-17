# WebArena site options for the Freestyle VM (research, 2026-10-17)

## TL;DR

- **The original shopping image (63 GiB tar, ~117 GB once loaded) can never fit Free or Hobby.** The other *original* images are no better: forum 53 GB tar, gitlab 78 GB tar, wiki 95 GB. Only the original CMS/admin (9.6 GB tar, ~19.9 GB loaded) is small, and it is still too big for Free.
- **There is a much better option: the community-maintained "WebArena-Verified" slim images on Docker Hub (`am1n3e/webarena-verified-*`, published by the ServiceNow WebArena-Verified project).** Same site content, much smaller, plain `docker pull`, no Google Drive. I measured the layers myself by streaming them from the registry (see "How measured").
  - shopping_admin: 1.25 GB compressed / **3.0 GB** on disk
  - reddit (Postmill forum): 4.57 GB compressed / **8.5 GB** on disk
  - shopping: 5.42 GB compressed / **13.6 GB** on disk
  - gitlab: 22.0 GB compressed / ~31.6 GB on disk (doc figure, not measured by me)
- **Recommendation: `reddit` (Postmill forum, port 9999) from `am1n3e/webarena-verified-reddit`, task 404 ("Upvote the newest post in books subreddit"), held-out transfer tasks 405-408.** It fits a Free VM (~13 GB peak of 25 GB free), is graded by `program_html` (reads page state, no LLM key), and has a clean, diagnosable failure ("newest" means the **New** sort, not the default **Hot** sort).
- Fallback if you want to keep the current `vm/task.json` (shopping task 509): the verified shopping image also fits Free on paper (~19 GB peak of 25 GB), but it is tight and its RAM need on 8 GiB is unverified.

## 1. Image sizes

### Original WebArena images (Google Drive)

Sizes are exact bytes from `Content-Range` on a 1-byte range request to `https://drive.usercontent.google.com/download?id=<ID>&export=download&confirm=t` (header `-r 0-0`, nothing downloaded). The warning page from `drive.google.com/uc?export=download&id=<ID>` gives the same value rounded, in GiB (e.g. "9.0G"). Note Google's "G" is GiB.

| Site (port) | File | Exact bytes | GB (10^9) | GiB | Warning-page value |
|---|---|---|---|---|---|
| shopping_admin / CMS (7780) | `shopping_admin_final_0719.tar` | 9,640,032,256 | **9.64** | 9.0 | 9.0G |
| forum / Postmill (9999) | `postmill-populated-exposed-withimg.tar` | 53,435,097,088 | **53.4** | 49.8 | 50G |
| shopping (7770) | `shopping_final_0712.tar` | 67,575,898,112 | **67.6** | 62.9 | 63G (matches your 63) |
| gitlab (8023) | `gitlab-populated-final-port8023.tar` | 77,755,595,776 | **77.8** | 72.4 | 72G |
| wikipedia (8888) | `wikipedia_en_all_maxi_2022-05.zim` | 95,199,730,590 | **95.2** | 88.7 | 89G |
| map (3000) | not measured | n/a | ~180 GB per WebArena README | | |

**Important correction to the "2x" assumption.** The tar is *not* the loaded size. WebArena-Verified's docs list the loaded ("original") image sizes: shopping 117 GB, shopping_admin 19.9 GB, reddit 107 GB, gitlab 155 GB. So the original shopping image needs ~117 GB on disk after load, plus the tar if it is kept (stream with `curl ... | docker load` to avoid keeping it), and more with the containerd image store. That is Pro-only, with little headroom.

### Mirrors

- `archive.org/download/webarena-env-{shopping,shopping-admin,forum,gitlab,wiki}-image`: items exist but are **dark** (`is_dark: true` in `/metadata/`), download and details pages 404/403. Still unusable, as you found.
- `metis.lti.cs.cmu.edu/webarena-images/*`: still **403** (index and file Range requests).
- Other public archive.org items do exist for the forum: `postmill-populated-exposed-withimg` (53,435,097,088 bytes, identical size to the Drive file) and `postmill-populated-exposed-withimg-v3` (72,076,608,000 bytes). The download URL answers `302` (I did not follow it or download). So the original forum tar has a second mirror, but it is still 53 GB.
- Docker Hub `webarenaimages/shopping_final_0712` and `webarenaimages/postmill-populated-exposed-withimg`: both **42.3 GB compressed**, last pushed over a year ago. The WebArena maintainers said in [issue #231](https://github.com/web-arena-x/webarena/issues/231) these are **not official**. Not smaller than useful anyway.
- **WebArena-Verified slim images** (official ServiceNow project, [repo](https://github.com/ServiceNow/webarena-verified), [docs](https://servicenow.github.io/webarena-verified/getting_started/environments/)): `am1n3e/webarena-verified-{shopping,shopping_admin,reddit,gitlab,wikipedia,map}` on Docker Hub, announced Feb 2, 2026. See next table.
- **WebArena-Lite** (THUDM VAB-WebArena-Lite, 165 tasks): a task subset only; it uses the **same standard WebArena environments/images**, so it gives no size relief.
- WebArena-Verified dataset itself changes graders to be network-event/response based and removes LLM-based evaluation for most tasks; the slim images are what shrink things.

### WebArena-Verified slim images (Docker Hub, `:latest`, linux/amd64)

"Compressed" = sum of layer sizes in the registry manifest (exact bytes via the registry API). "On disk (measured)" = I streamed every layer from the registry, gunzipped it in memory and summed the tar byte counts (script is a few lines of Python; layers not saved). That is the unpacked layer size; real disk use is slightly higher (filesystem overhead).

| Site | Image | Compressed | On disk (measured) | Docs "optimized size" | Docs "original size" |
|---|---|---|---|---|---|
| shopping_admin (7780) | `am1n3e/webarena-verified-shopping_admin` | 1,245,375,030 B = **1.25 GB** | 3,016,315,392 B = **3.02 GB** | 2.9 GB | 19.9 GB |
| reddit (9999) | `am1n3e/webarena-verified-reddit` | 4,572,726,113 B = **4.57 GB** | 8,492,472,832 B = **8.49 GB** | 8.41 GB | 107 GB |
| shopping (7770) | `am1n3e/webarena-verified-shopping` | 5,421,321,813 B = **5.42 GB** | 13,570,672,640 B = **13.57 GB** | 13.3 GB | 117 GB |
| gitlab (8023) | `am1n3e/webarena-verified-gitlab` | 22.01 GB (manifest) | not measured (docs: 31.6 GB) | 31.6 GB | 155 GB |
| wikipedia (8888) | `am1n3e/webarena-verified-wikipedia` | 0.05 GB | image only; needs the separate ~95 GB ZIM data dir | 115 MB | n/a |
| map | `am1n3e/webarena-verified-map` | 1.19 GB | docs: 3.28 GB, plus separate data downloads | 3.28 GB | n/a |

The docs' "optimized size" matches my measured unpacked sizes within a few percent, so I trust the unmeasured gitlab number (31.6 GB) as an estimate only.

How measured: `https://registry-1.docker.io/v2/am1n3e/webarena-verified-<site>/manifests/latest` (anonymous token from `auth.docker.io`), then streamed each blob and decompressed. I tried `docker pull` locally to cross-check, but the local Docker Desktop containerd store returned `input/output error` on unrelated blobs (pre-existing, not caused by this task, left untouched).

## 2. Fit analysis

Free: 32 GB disk, ~25 GB free after OS, 8 GiB RAM, 4 vCPU. Hobby: 64 GB disk. Pro: 256 GB.

Peak disk during load:
- **containerd image store (Docker 29 default)**: compressed blobs stay in the content store *and* layers are unpacked as snapshots, so peak/steady ≈ compressed + unpacked.
- **Classic overlay2 store** (`/etc/docker/daemon.json` `{"features": {"containerd-snapshotter": false}}`): `docker pull` downloads compressed layers, unpacks them, then discards the compressed copies; steady state ≈ unpacked only. I did not test this setting inside a Freestyle VM; it is standard Docker behavior but unverified here.
- Add runtime growth (MySQL/Postgres/Elasticsearch/log/cache writes, `/tmp`, browser screenshots). I did not measure this.

| Image | Peak (containerd store) | Steady (classic store) | Free (25 GB free) | Hobby (64 GB) | Pro (256 GB) |
|---|---|---|---|---|---|
| **verified shopping_admin** | ~4.3 GB | ~3.0 GB | **fits easily** | fits | fits |
| **verified reddit** | ~13.1 GB | ~8.5 GB | **fits (≈12 GB spare)** | fits | fits |
| **verified shopping** | ~19.0 GB | ~13.6 GB | **fits but tight (≈6 GB spare); RAM unverified** | fits | fits |
| verified gitlab | ~53.6 GB | ~31.6 GB (classic) | no | borderline (classic store only; GitLab also wants ~4+ GB RAM, ideally more) | fits |
| verified wikipedia | image tiny, data ~95 GB | | no (data) | no (data) | fits |
| original shopping_admin (9.64 GB tar, ~19.9 GB loaded) | ~29.5 GB if tar kept; ~20 GB if streamed (classic) | | no / marginal | fits | fits |
| original forum (53.4 GB tar, ~107 GB loaded) | | | no | no | fits (stream the load) |
| original shopping (67.6 GB tar, ~117 GB loaded) | | | no | no | fits only on Pro, tight with tar kept (67.6 + 117 = 185 GB) and containerd (+compressed copy) |
| original gitlab (77.8 GB tar, ~155 GB loaded) | | | no | no | Pro, tight (stream the load) |
| original wikipedia (95.2 GB zim) | | | no | no | fits; read-only site, poor demo fit |

Original-image loaded sizes are the WebArena-Verified docs' figures, not my own measurement.

**RAM caveat (all rows):** Free VMs have 8 GiB. I did not run any of these images. The reddit stack (PHP-FPM/nginx + Postgres) is light; Magento (shopping/admin) runs MySQL + PHP + (likely) Elasticsearch/OpenSearch inside the container and is the riskiest on RAM. WebArena's own guidance (t3a.xlarge, 16 GiB) is for all sites at once.

## 3. Candidate tasks

Source: `$env:TEMP\webarena\config_files\test.raw.json` (812 tasks, shallow clone of web-arena-x/webarena). Site counts: shopping 187(+), shopping_admin 182, gitlab 180, reddit 106, map 109. Evaluator notes:
- `program_html` with `must_include` / `exact_match`: no LLM key.
- `url_match`: no LLM key.
- `string_match` with `fuzzy_match` (LLM-judged) and `ua_match`: need an OpenAI key. **None of the candidates below use these.**
- Note: grading `program_html` requires a logged-in browser session (WebArena `storage_state`). The slim images also accept auto-login headers (`X-Postmill-Auto-Login: user:pass` for reddit, `X-M2-Admin-Auto-Login: admin:admin1234`, `X-M2-Customer-Auto-Login: email:password` for shopping), which may simplify the harness. Not tested.

### reddit (Postmill, verified image fits Free)

| task_id | intent | eval_types | Why a baseline agent plausibly fails; lesson |
|---|---|---|---|
| **404** (books), 405 (DIY), 406 (Futurology), 407 (deeplearning), 408 (explainlikeimfive); same `intent_template_id` 22 | "Upvote the newest post in books subreddit" | `program_html` | Grader reads `div.submission__vote form` class on one *specific* post URL (e.g. `/f/books/124260/adults-reading-to-each-other-out-loud`) and requires `vote vote--user-upvoted`. A forum page lists posts by **Hot** by default, so a typical agent upvotes the first/top post, which is the wrong post. Lesson: "On Postmill, forum pages default to Hot; before upvoting 'newest', switch the sort to **New** (`/f/<forum>/new`) and vote on the first item." Cleanly transfers 404 → 405-408 (same template, different forum). No LLM key. |
| 714-718 (e.g. 714 gadgets) | "Thumbs down the top N post ever in <forum>" | `program_html` | Needs Sort = **Top** *and* time filter = **All time**; default windows or Hot return other posts, so the vote lands on the wrong post. Lesson: "Choose Top, then set the time range to All time, then count N." Slightly more steps than 404. No LLM key. |
| 600-604 (e.g. 600) | "Post my question '...' in a subreddit where I'm likely to get an answer" | `url_match`, `program_html` | Exactly the "specific forum selection" case: the submit form has a **Forum** dropdown (default not the right one); grader needs the final URL to contain `/f/consoles` and the post body to contain the question. Failure: posts into a wrong/default forum, or never selects one. Lesson: "Postmill's Create submission form needs the Forum field set; look at `/forums` for the topical forum first, set Forum before submitting." Weakness: the correct forum is task-specific, so the lesson is less general than 404's. No LLM key. |
| 595-599 (e.g. 595 "space") | "Open the thread of a trending post on the forum 'space' and subscribe." | `url_match`, `program_html` | Grader checks homepage `#sidebar > section` text includes the forum name (subscriptions list) and the last URL under `/f/space`. Agents tend to open the thread but never press **Subscribe** (it is a forum-level button), or press it in the wrong place. Lesson: "Subscribing happens via the Subscribe button on the forum page/sidebar; verify it flips to Unsubscribe." No LLM key. I did not verify where the Subscribe button is rendered in this Postmill version. |
| 580-584 (e.g. 580) | "Create a new forum named X, with a description of Y, and include [...] in the sidebar" | `program_html` | Grader opens `/f/<name>/edit` and reads `#forum_description` and `#forum_sidebar`. Forum form has separate Name / Title / Description / Sidebar fields and required fields (Title); likely failure: description and sidebar items mixed up or the required Title left empty so creation fails. Lesson: "Fill Name, Title (required), Description, Sidebar separately; put list items in Sidebar." Unverified whether the demo user may create forums on this instance. No LLM key. |

### shopping_admin (Magento admin, verified image fits Free, smallest)

| task_id | intent | eval_types | Reasoning |
|---|---|---|---|
| 501-505 (e.g. 501) | "Make all Taurus Elements Shell as out of stock" | `program_html` | Grader reads `product[quantity_and_stock_status][is_in_stock]` == "0" on one product edit page. "All" suggests multiple variants/products; agents flip one record or set Qty without Stock Status. Lesson: "Set Stock Status = Out of Stock (not just Qty) on every matching product/variant, then Save." Medium confidence this is a clean failure mode. |
| 496-500 | "Update order #299 with the Federal Express tracking number ..." | `program_html` | Needs Ship → Add Tracking Number → Submit Shipment; grader looks for "Tracking number ... assigned" in the shipment comment history. Easy-to-miss: tracking can only be added when creating a shipment. Lesson: "Order → Ship → Add Tracking Number (choose carrier) → Submit Shipment." |
| 453-457 | "Disable Teton pullover hoodie from the site" | `program_html` | Grader needs `product[status]` == "2" after saving. Failure: toggling "Enable Product" without Save, or editing the wrong match from the grid. Lesson: "Toggle Enable Product off and click Save." Easy; baseline may often pass. |
| 492-495 | "Notify Jane Doe in their most recent pending order with message ..." | `program_html` | Must pick the *most recent* **pending** order and submit a comment (grader reads first note). Lesson: "Filter orders by status Pending, sort by date, add comment on the newest." |

All five tasks involve no LLM key. Note: slim `shopping_admin` disables mass-delete actions; irrelevant to these.

### shopping (verified image fits Free, tight)

- Current plan task **509** (`program_html`, `shopping_get_latest_order_url()`, product ASIN `B01J4MM3KO` in the latest order) can be kept. Not re-analysed here; only noting that the verified shopping image should serve the same catalog (claimed by the project, not checked by me).

### gitlab (needs Pro; Hobby borderline), original data

| task_id | intent | eval_types | Reasoning |
|---|---|---|---|
| 411-414 (e.g. 411) | "Make the LICENSE of byteblaze/cloud-to-butt to MIT license" | `program_html` | Needs the "Apply a template"/Add LICENSE flow and commit; easy to miss the template dropdown and commit step. |
| 475-479 | "Set up a new, empty repository with the name ..." | `program_html` | New project form: Create blank project, uncheck "Initialize repository with a README" (the *empty* part). A baseline likely leaves the README box checked. Lesson: "Create blank project and untick Initialize with README." This is a nicely clean 'do X before Y' candidate. |
| 418-422 | "Set my gitlab status as Busy" | `program_html` | Set status via avatar menu; trivial, baseline probably passes. |

Not recommended: needs Pro (or Hobby with the classic store and ≥ probably 8 GiB RAM), and I have not looked at GitLab RAM behavior in the slim image.

## 4. Recommendation

**Use `am1n3e/webarena-verified-reddit` on a Free VM and make task 404 ("Upvote the newest post in books subreddit") the baseline-fail task, with 405-408 as the "transfer" tasks.**

- Fits comfortably: 4.6 GB download, 8.5 GB unpacked, ~13 GB peak vs 25 GB free. No Hobby/Pro or AWS needed.
- Graded by `program_html` (reads real page state: the vote form's CSS class), no OpenAI key needed for evaluation. Matches PRD's "evaluator, not the agent, decides".
- Diagnosable failure + one-line lesson: "'Newest' is the **New** sort tab; Postmill defaults to Hot." Same template across 404-408 gives a real transfer demonstration (a lesson learned on `books` helps on `DIY`, `Futurology`, `deeplearning`, `explainlikeimfive`).
- Postmill is light (PHP + Postgres), so the 8 GiB RAM limit is the least concerning here.

Fallback ordering:
1. If you need the current shopping task 509: verified shopping on Free (tight disk, unknown RAM) or bump to Hobby.
2. If you want a rich form-based task: verified shopping_admin (3 GB, trivial to fit) with 496-500 (shipment tracking) or 501-505 (out of stock).
3. Original images/EC2 with the AMI or a Pro plan are only needed if you insist on the *original* images; with the slim images they are no longer necessary for the demo.

## 5. Risks and what I could not verify

- **I did not run any image.** Local Docker Desktop's containerd store is returning `input/output error`, so I could not `docker pull`/`run` the slim images locally. All sizes come from registry manifests and streamed layer sizes; RAM use, startup time, and runtime disk growth are unmeasured.
- **Freestyle VM specifics unverified**: whether the VM can use the classic docker store, outbound Docker Hub access/rate limits (anonymous pull limits apply; large layers), and whether `am1n3e/...` images need `--privileged`/extra ports (they expose an env-ctrl port 8877 in addition to the site port).
- **Slim images are modified**, not byte-identical to the originals: header auto-login, mass-delete disabled (admin), a Postmill vote-count fix and removed submission rate limits (reddit), etc. The grader (`program_html`) should behave the same, but I did not confirm it against a running instance. The dataset task data for 404-408 refers to specific post URLs/IDs; I assume slim reddit has the same DB (the project claims "exact content"); unverified.
- **"Baseline fails" is reasoned, not observed.** I did not run an LLM agent. The Hot-vs-New default is standard Postmill behavior; for the "Top, All time" and Subscribe-button claims I could not confirm UI details.
- The docker images come from a Docker Hub user (`am1n3e`) referenced by the ServiceNow project's docs, but images are third-party hosted: pin the digest and review before relying on it. `latest` digests may change.
- Gitlab/wikipedia/map slim-image numbers for disk usage come from project docs, not my measurement (gitlab compressed size is from the manifest).
- Original-image loaded sizes (117/107/155/19.9 GB) are from the WebArena-Verified docs, not measured.
- Drive "G" in the warning page is GiB; I report both exact bytes and GB (10^9).
