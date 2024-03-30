"use client";

import Image from "next/image";
import { useState } from "react";
import { SPLITWISE_API_URL } from "~/constant";

export default function Home() {
  const [apiKey, setApiKey] = useState("");
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState("");

  async function downloadData() {
    if (!apiKey) {
      setError("API key is required.");
      return;
    }
    setLoadingData(true);
    setError(""); // Reset error state before attempting to fetch
    const response = await fetch(`/api/download`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ apiKey }),
    });

    setLoadingData(false); // Ensure loading state is reset whether fetch is successful or not

    if (response.status === 200) {
      const data = await response.json();
      console.log(data);
      const dataStr =
        "data:text/json;charset=utf-8," +
        encodeURIComponent(JSON.stringify(data));
      const downloadAnchorNode = document.createElement("a");
      downloadAnchorNode.setAttribute("href", dataStr);
      downloadAnchorNode.setAttribute("download", "splitwise_data.json");
      document.body.appendChild(downloadAnchorNode); // required for firefox
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
    } else {
      setError("Failed to fetch data. Please try again.");
      console.log("Error fetching data");
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center gap-8 p-4 lg:p-24 mt-10">
      <h1 className="text-2xl text-center">
        Export data from <span className="text-green-400">Splitwise</span> to
        JSON
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
        {error && <p className="text-red-500 text-center">{error}</p>}
      </div>

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
    </main>
  );
}
