import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";

// Stockage temporaire des conversions
export const jobs = new Map();

// Formats et encodeurs
const formats = {
    mp4: {
        extension: ".mp4",
        options: [
            "-c:v", "libx264",
            "-c:a", "aac",
            "-movflags", "+faststart"
        ]
    },

    webm: {
        extension: ".webm",
        options: [
            "-c:v", "libvpx-vp9",
            "-c:a", "libopus"
        ]
    },

    mp3: {
        extension: ".mp3",
        options: [
            "-vn",
            "-c:a", "libmp3lame",
            "-b:a", "192k"
        ]
    },

    wav: {
        extension: ".wav",
        options: [
            "-vn",
            "-c:a", "pcm_s16le"
        ]
    }
};

// Récupérer la durée d'un média avec ffprobe
function getDuration(inputPath) {
    return new Promise((resolve, reject) => {
        const probe = spawn("ffprobe", [
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            inputPath
        ]);

        let output = "";

        probe.stdout.on("data", (data) => {
            output += data.toString();
        });

        probe.on("error", reject);

        probe.on("close", (code) => {
            const duration = Number.parseFloat(output.trim());

            if (code !== 0 || !Number.isFinite(duration) || duration <= 0) {
                return reject(
                    new Error("Impossible de déterminer la durée du média.")
                );
            }

            resolve(duration);
        });
    });
}

// Contrôleur de conversion
export async function convertVideo(req, res) {
    if (!req.file) {
        return res.status(400).json({
            error: "Aucune vidéo envoyée."
        });
    }

    const inputPath = req.file.path;
    const format = req.body.format;

    if (!Object.hasOwn(formats, format)) {
        fs.unlink(inputPath, () => {});

        return res.status(400).json({
            error: "Format de sortie non autorisé."
        });
    }

    let duration;

    try {
        duration = await getDuration(inputPath);
    } catch (error) {
        fs.unlink(inputPath, () => {});

        return res.status(400).json({
            error: error.message
        });
    }

    const jobId = randomUUID();
    const outputName = jobId + formats[format].extension;
    const outputPath = path.resolve("converted", outputName);

    const job = {
        id: jobId,
        status: "processing",
        progress: 0,
        downloadUrl: null,
        error: null
    };

    jobs.set(jobId, job);

    const args = [
        "-y",
        "-i", inputPath,
        ...formats[format].options,
        "-progress", "pipe:1",
        "-nostats",
        outputPath
    ];

    const ffmpeg = spawn("ffmpeg", args);

    let progressData = "";

    ffmpeg.stdout.on("data", (data) => {
        progressData += data.toString();

        const lines = progressData.split(/\r?\n/);
        progressData = lines.pop() ?? "";

        for (const line of lines) {
            const [key, value] = line.split("=");

            if (key === "out_time_us") {
                const time = Number(value);

                if (Number.isFinite(time)) {
                    const seconds = time / 1_000_000;

                    job.progress = Math.min(
                        99,
                        Math.max(0, Math.floor(seconds / duration * 100))
                    );
                }
            }

            if (key === "progress" && value === "end") {
                job.progress = 100;
            }
        }
    });

    ffmpeg.stderr.on("data", (data) => {
        console.error(data.toString());
    });

    ffmpeg.on("error", (error) => {
        job.status = "error";
        job.error = "Impossible de démarrer FFmpeg.";

        console.error(error);

        fs.unlink(inputPath, () => {});
    });

    ffmpeg.on("close", (code) => {
        fs.unlink(inputPath, () => {});

        if (code !== 0) {
            job.status = "error";
            job.error = "La conversion a échoué.";

            return;
        }

        job.status = "completed";
        job.progress = 100;
        job.downloadUrl =
            `/download/${encodeURIComponent(outputName)}`;
    });

    // Répondre immédiatement avec l'identifiant du traitement
    return res.status(202).json({
        message: "Conversion lancée.",
        jobId
    });
}

// Contrôleur de suivi
export function getProgress(req, res) {
    const job = jobs.get(req.params.id);

    if (!job) {
        return res.status(404).json({
            error: "Conversion introuvable."
        });
    }

    return res.json(job);
}
