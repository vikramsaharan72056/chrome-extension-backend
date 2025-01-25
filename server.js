const express = require("express");
const bodyParser = require("body-parser");
const { spawn } = require("child_process");
const cors = require("cors");
const fs = require("fs");

const app = express();
const PORT = 5000;

app.use(cors(
  origin = "https://rr3---sn-5hne6nsr.googlevideo.com"
));
app.use(bodyParser.json());

// Global variable to store progress for each URL
let progressMap = {};

// Path to the static cookies file
const cookiesFilePath = "cookies.txt"; // Replace this with the actual path to your cookies.txt file

// Download endpoint
app.get("/download", (req, res) => {
  res.send("Download endpoint");
});

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

  // Function to extract individual video URLs from a playlist
  const extractPlaylistVideos = (playlistUrl) =>
    new Promise((resolve, reject) => {
      const ytDlp = spawn("yt-dlp", [
        "-j", // JSON output
        "--flat-playlist", // Extract video URLs without downloading
        playlistUrl,
      ]);

      let data = "";

      ytDlp.stdout.on("data", (chunk) => {
        data += chunk;
      });

      ytDlp.stderr.on("data", (err) => {
        console.error(`Error extracting playlist: ${err}`);
      });

      ytDlp.on("close", (code) => {
        if (code === 0) {
          // Parse the JSON and extract video URLs
          const videoUrls = data
            .split("\n")
            .filter((line) => line.trim() !== "")
            .map((line) => JSON.parse(line).url);
          resolve(videoUrls);
        } else {
          reject(new Error("Failed to extract playlist videos"));
        }
      });
    });

  // Function to download a single video
  const downloadVideo = (url) =>
    new Promise((resolve, reject) => {
      console.log(`Starting download for: ${url}`);

      const ytDlp = spawn("yt-dlp", [
        "--cookies",
        cookiesFilePath, // Static cookies for authentication
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

        // Track progress percentage
        const progressMatch = message.match(/(\d+\.\d+)%/);
        if (progressMatch) {
          progressMap[url] = parseFloat(progressMatch[1]);
        }
      });

      ytDlp.on("close", (code) => {
        if (code === 0) {
          console.log(`Download complete for: ${url}`);
          progressMap[url] = 100; // Mark as complete
          resolve();
        } else {
          console.error(`Download failed for ${url} with code: ${code}`);
          progressMap[url] = -1; // Mark as failed
          reject(new Error(`Download failed for ${url}`));
        }
      });
    });

  // Process all videos or playlists
  const processUrl = async (url) => {
    const urlParams = new URLSearchParams(new URL(url).search);
    const isPlaylist = urlParams.has("list");
    const index = urlParams.get("index");

    if (isPlaylist) {
      if (index && index !== "1") {
        // If "index" exists and is not "1", download only that video
        console.log(`Downloading single video from playlist: ${url}`);
        await downloadVideo(url);
      } else {
        // If "index=1" or no "index", download all videos in the playlist
        console.log(`Downloading all videos from playlist: ${url}`);
        const playlistVideos = await extractPlaylistVideos(url);
        for (const videoUrl of playlistVideos) {
          await downloadVideo(videoUrl);
        }
      }
    } else {
      // If not a playlist, download a single video
      await downloadVideo(url);
    }
  };

  try {
    for (const url of urlList) {
      await processUrl(url);
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
