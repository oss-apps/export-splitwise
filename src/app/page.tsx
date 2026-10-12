"use client";

import { useState } from "react";
import { ExportError, exportSplitwise, type Progress } from "~/lib/export";

const getFileName = () => {
  // Current date and time in YYYY-MM-DD_HH-MM-SS format
  const today = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  const date = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  const time = `${pad(today.getHours())}-${pad(today.getMinutes())}-${pad(today.getSeconds())}`;
  return `splitwise_data_${date}_${time}.json`;
};

export default function Home() {
  const [apiKey, setApiKey] = useState("");
  const [loadingData, setLoadingData] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState("");

  async function downloadData() {
    if (!apiKey) {
      setError("API key is required.");
      return;
    }
    setLoadingData(true);
    setError(""); // Reset error state before attempting to fetch
    setProgress(null);

    try {
      const data = await exportSplitwise(async (request) => {
        const response = await fetch(`/api/download`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ apiKey, ...request }),
        });
        return { status: response.status, body: await response.json().catch(() => null) };
      }, setProgress);

      // A blob URL handles large exports that a data URL can't.
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data)], { type: "application/json" })
      );
      const downloadAnchorNode = document.createElement("a");
      downloadAnchorNode.setAttribute("href", url);
      downloadAnchorNode.setAttribute("download", getFileName());
      document.body.appendChild(downloadAnchorNode); // Required for Firefox
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      setError(
        e instanceof ExportError ? e.message : "Failed to fetch data. Please try again."
      );
    } finally {
      setLoadingData(false); // Ensure loading state is reset whether fetch is successful or not
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center gap-8 p-4 lg:p-24 mt-10">
      <h1 className="text-2xl text-center">
        Export data from <span className="text-green-400">Splitwise</span>
      </h1>
      <div className="flex flex-col justify-center gap-8">
        <input
          type="text"
          placeholder="Splitwise API key"
          className="p-1 rounded-md bg-gray-700 px-2"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
        <button
          className="bg-green-400 p-1 rounded-md text-black"
          onClick={downloadData}
          disabled={loadingData}
        >
          {loadingData ? "Downloading..." : "Download Data"}
        </button>
        {loadingData && progress ? (
          <p className="text-gray-400 text-center" aria-live="polite">
            {progress.step}… {progress.expenses} expenses so far
          </p>
        ) : null}
        {error && (
          <p className="text-red-500 text-center max-w-[400px]" role="alert">
            {error}
          </p>
        )}
      </div>

      <p className="text-gray-400 text-center text-sm max-w-[500px]">
        The file has your friends, groups and every expense, including deleted
        ones. Long histories can take a minute.
      </p>

      <div className="flex flex-col gap-4 bg-slate-900 p-4 w-full lg:max-w-[500px] rounded-md">
        <div className="">How to get API key</div>
        <ol className="list-disc list-inside flex flex-col gap-4">
          <li>
            Go to Apps link:{" "}
            <a
              href="https://secure.splitwise.com/apps/new"
              target="_blank"
              className="text-green-400 bg-green-900 bg-opacity-50 px-2 py-0.5 rounded"
            >
              secure.splitwise.com/apps/new
            </a>
          </li>
          <li>
            Enter <span className=" text-green-400">Application name</span> as
            &quot;Export data&quot;
          </li>
          <li>
            Enter <span className="text-green-400">Description</span> as
            &quot;Export data from Splitwise&quot;
          </li>
          <li>
            Enter <span className="text-green-400">Homepage URL</span> as
            &quot;https://www.splitwise.com/&quot;
          </li>
          <li>
            Accept terms and click{" "}
            <span className="text-green-400">Register and get API key</span>
          </li>
          <li>
            Now under API keys section, click on{" "}
            <span className="text-green-400">Create API key</span>
          </li>
          <li>
            Copy the key and paste it in the input above and click download
          </li>
        </ol>
      </div>
      <div className="text-xl">
        We don&apos;t store your data or api keys. It&apos;s only used to export
        data from Splitwise. You can check the code on{" "}
        <a
          href="https://github.com/oss-apps/export-splitwise"
          target="_blank"
          className="text-green-400"
        >
          GitHub
        </a>
      </div>
    </main>
  );
}
