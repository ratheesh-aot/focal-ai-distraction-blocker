# Use AI Distraction Blocker for free with a local Laya server

AI Distraction Blocker uses **Jev** (through OpenRouter) by default. That needs an OpenRouter
API key and costs a tiny amount per page.

If you want it **free and private**, run Convai's open-weight **Laya** model on your own computer
with the [Laya local HTTP server](https://github.com/ratheesh-aot/laya-local-http-server) and point
the extension at it. Nothing leaves your machine.

This guide takes about 10 minutes, most of it the one-time model download.

## What you need

- **Python 3.12 or newer**
- **[uv](https://docs.astral.sh/uv/)**, the Python package manager the server uses
- **git**
- About **1 GB of disk** for the model weights
- Windows, Linux, or macOS on Apple Silicon. AMD GPUs are not supported; on Windows and Linux the
  server runs on the CPU unless you have an NVIDIA GPU (see the server's README).

Install uv if you don't have it:

```bash
# macOS / Linux
curl -LsSf https://astral.sh/uv/install.sh | sh

# Windows (PowerShell)
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

## 1. Get the server

```bash
git clone https://github.com/ratheesh-aot/laya-local-http-server.git
cd laya-local-http-server
uv sync
```

`uv sync` picks the right runtime for your computer: MLX on Apple Silicon, PyTorch everywhere else.

## 2. Start it

```bash
uv run laya-api
```

The first start downloads the Laya checkpoint (about 850 MB) from Hugging Face. Later starts take
a few seconds on a Mac and about 25 seconds on a Windows/Linux CPU. Leave this terminal open while
you browse.

The server listens on **http://localhost:8000**. Check it in a second terminal or your browser:

```bash
curl http://localhost:8000/health
```

You should see `"status": "ok"`.

### Using a different port

If port 8000 is taken, pick another one and use the same port in the extension:

```bash
# macOS / Linux
LAYA_PORT=8002 uv run laya-api

# Windows (PowerShell)
$env:LAYA_PORT = "8002"; uv run laya-api
```

## 3. Point the extension at it

1. Click the extension's toolbar icon, then **Settings**.
2. Under **Model**, choose **Laya**.
3. **Laya server URL**: `http://localhost:8000` (or your port).
4. **Checkpoint**: leave `english`, unless most of your browsing is in another language — then pick
   `multilingual`.
5. Click **Test connection**. You should see something like
   `Laya ok on torch-cpu, loaded: english · 40 ms`.
6. Click **Save**.

Open any news site. The popup's model line should turn green: **Laya online**.

## What to expect

- **Speed.** On a laptop CPU, Laya takes roughly 0.5–0.8 s per element when the extension sends a
  batch, and about 15–25 ms on Apple Silicon. Pages never wait for it: obvious distractions are
  hidden instantly by built-in rules, and only borderline elements (at most 12 per scan) go to the
  model in the background. Results are remembered per site for 7 days.
- **Accuracy.** Laya is used zero-shot (not fine-tuned for this task). It is reliable for ads,
  cookie banners, the article itself and site navigation. It is weaker on signup popups, paywalls
  and chat bubbles whose markup gives no hint; the extension's built-in rules cover the common
  ones. If something real gets hidden, raise **Model confidence needed to hide** in Settings, or
  turn on **Debug mode** to see each detection's label and confidence.

## Troubleshooting

| What you see | What to do |
| --- | --- |
| Popup says **Laya offline** | The server isn't running or the URL/port doesn't match. Run `curl http://localhost:8000/health` and compare the port with Settings. |
| **Test connection** fails right after starting the server | Wait for the server to finish loading (first start downloads the model). |
| Popup says **rejected the API key** | You started the server with `LAYA_API_KEYS`. The extension doesn't send Laya keys yet — start the server without it. Keep it bound to `127.0.0.1` (the default) so it isn't reachable from other machines. |
| Very slow on Windows/Linux | Expected on CPU. With an NVIDIA GPU, follow "GPU acceleration" in the server's README. |

## Privacy

With Laya selected, element summaries (tag, class names, a short piece of visible text, button
labels, link domains and position) go only to the server URL you entered. With the default
`localhost` address that is your own computer. See the [privacy policy](privacy-policy.md).
