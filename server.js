const express = require("express");
const bodyParser = require("body-parser");
const { spawn } = require("child_process");
const cors = require("cors");

const app = express();
const PORT = 5000;

app.use(cors());
app.use(bodyParser.json());

// Global variable to store progress for each URL
let progressMap = {};

// Download endpoint
app.get("/download", (req, res) => {
  res.send("Download endpoint");
})
app.post("/download", async (req, res) => {
  const { urlList } = req.body; // Expecting a list of URLs from the frontend

  if (!urlList || urlList.length === 0) {
    return res.status(400).json({ message: "Video URLs are required" });
  }

  console.log(`Starting download for ${urlList.length} URLs`);

  // Reset the progress map
  progressMap = {};
  urlList.forEach((url) => {
    progressMap[url] = 0; // Initialize progress for each URL
  });

  // Function to download a single video
  const downloadVideo = (url) =>
    new Promise((resolve, reject) => {
      console.log(`Starting download for: ${url}`);
  
      const ytDlp = spawn("yt-dlp", [
        "-f",
        "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]",
        "--merge-output-format",
        "mp4",
        "-o",
        "D:\\yt-dlp-downloads\\%(title)s.%(ext)s",
        url,
      ]);
      
  
      ytDlp.stderr.on("data", (data) => {
        const message = data.toString();
        console.error(`Stderr for ${url}: ${message}`);
      });
  
      ytDlp.on("close", (code) => {
        if (code === 0) {
          console.log(`Download complete for: ${url}`);
          resolve();
        } else if (code === 1) {
          console.error(`Download failed for ${url} due to file lock. Retrying...`);
          // Retry after a small delay
          setTimeout(() => downloadVideo(url).then(resolve).catch(reject), 1000);
        } else {
          console.error(`Download failed for ${url} with code: ${code}`);
          reject(new Error(`Download failed for ${url}`));
        }
      });
    });
  

  // Download all videos in sequence
  try {
    for (const url of urlList) {
      await downloadVideo(url);
    }
    res.status(200).json({ message: "All downloads completed successfully" });
  } catch (error) {
    console.error("Error downloading videos:", error);
    res.status(500).json({ message: "Error downloading videos", error: error.message });
  }
});

// SSE endpoint for real-time progress
app.get("/progress", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  // Send progress updates every second
  const interval = setInterval(() => {
    res.write(`data: ${JSON.stringify(progressMap)}\n\n`); // Send the full progress map

    // Stop sending updates if all downloads are complete
    const allCompleted = Object.values(progressMap).every((progress) => progress === 100 || progress === -1);
    if (allCompleted) {
      clearInterval(interval);
      res.end();
    }
  }, 1000);

  // Clear interval if the client disconnects
  req.on("close", () => {
    clearInterval(interval);
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
