
import { pipeline, env } from "@huggingface/transformers";

env.allowRemoteModels = true;
env.useBrowserCache = true;
env.useWasmCache = true;

// Change this to true to use the old lightweight model.
const USE_LITE_MODEL = false;

const GRANITE =
  "onnx-community/granite-4.0-350m-ONNX-web";

const LITE =
  "onnx-community/SmolLM2-135M-Instruct-ONNX-MHA";

const MODEL = USE_LITE_MODEL ? LITE : GRANITE;

let generator = null;
let loadingPromise = null;
let generating = false;

async function loadModel() {
  if (generator) return generator;

  if (!loadingPromise) {
    self.postMessage({
      type: "status",
      message: "Loading " +
        (USE_LITE_MODEL ? "MiniMind Lite" : "IBM Granite"),
    });

    loadingPromise = pipeline("text-generation", MODEL, {
      device: "wasm",
      dtype: "q4",

      progress_callback: (info) => {
        if (info.status === "progress") {
          self.postMessage({
            type: "progress",
            file: info.file || "model",
            progress: Math.round(info.progress ?? 0),
          });
        }
      },
    })
      .then((model) => {
        generator = model;

        self.postMessage({
          type: "ready",
          model: USE_LITE_MODEL
            ? "SmolLM2 135M"
            : "IBM Granite 350M",
        });

        return generator;
      })
      .catch((error) => {
        loadingPromise = null;
        throw error;
      });
  }

  return loadingPromise;
}

self.onmessage = async (event) => {
  const { type, messages } = event.data;

  try {
    if (type === "load") {
      await loadModel();
      return;
    }

    if (type === "generate") {
      if (generating) return;

      generating = true;
      const model = await loadModel();

      const system = {
        role: "system",
        content:
          "You are MiniMind. Answer accurately, " +
          "briefly, and clearly. If unsure, say so."
      };

      // Only the newest user message for the first
      // Granite test: minimum context and lower RAM load.
      const lastUser = [...messages]
        .reverse()
        .find((m) => m.role === "user");

      if (!lastUser) {
        throw new Error("No user message found");
      }

      const start = performance.now();

      const result = await model(
        [system, lastUser],
        {
          max_new_tokens: 48,
          do_sample: false,
        }
      );

      const generated = result[0].generated_text;

      const reply = Array.isArray(generated)
        ? generated.at(-1)?.content
        : generated;

      const seconds =
        ((performance.now() - start) / 1000).toFixed(1);

      self.postMessage({
        type: "complete",
        reply: String(reply || "No response."),
        seconds,
      });
    }
  } catch (error) {
    console.error("MiniMind worker error:", error);

    self.postMessage({
      type: "error",
      message: error.message || String(error),
    });
  } finally {
    if (type === "generate") {
      generating = false;
    }
  }
};
