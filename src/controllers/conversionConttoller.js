import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

// Chemins absolus
const rootDir = process.cwd();

const uploadsDir = path.join(rootDir, "uploads");
const convertedDir = path.join(rootDir, "converted");

// Création des dossiers si nécessaire
fs.mkdirSync(uploadsDir, { recursive: true });
fs.mkdirSync(convertedDir, { recursive: true });

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

// Supprimer un fichier sans interrompre le programme
function removeFile(filePath) {
    fs.unlink(filePath, (error) => {
        if (error && error.code !== "ENOENT") {
            console.error("Erreur de suppression :", error);
        }
    });
}

// Récupérer la durée d'un média avec FFprobe
function getDuration(inputPath) {
    return new Promise((resolve, reject) => {
        const probe = spawn("ffprobe", [
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            inputPath
        ]);

        let output = "";
        let errorOutput = "";

        probe.stdout.on("data", (data) => {
            output += data.toString();
        });

        probe.stderr.on("data", (data) => {
            errorOutput += data.toString();
        });

        probe.on("error", reject);

        probe.on("close", (code) => {
            const duration = Number.parseFloat(output.trim());

            if (
                code !== 0 ||
                !Number.isFinite(duration) ||
                duration <= 0
            ) {
                return reject(
                    new Error(
                        errorOutput || "Impossible de déterminer la durée du média."
                    )
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
            error: "Aucun fichier envoyé."
        });
    }

    const inputPath = req.file.path;
    const format = req.body.format;

    if (!Object.hasOwn(formats, format)) {
        removeFile(inputPath);

        return res.status(400).json({
            error: "Format de sortie non autorisé."
        });
    }

    let duration;

    try {
        duration = await getDuration(inputPath);
    } catch (error) {
        removeFile(inputPath);

        console.error("Erreur FFprobe :", error);

        return res.status(400).json({
            error: "Impossible de lire ce média. Vérifie que le fichier est valide."
        });
    }

    const jobId = randomUUID();
    const outputName = jobId + formats[format].extension;
    const outputPath = path.join(convertedDir, outputName);

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

    let ffmpeg;

    try {
        ffmpeg = spawn("ffmpeg", args);
    } catch (error) {
        removeFile(inputPath);

        job.status = "error";
        job.error = "Impossible de démarrer FFmpeg.";

        console.error(error);

        return res.status(500).json({
            error: job.error
        });
    }

    let progressData = "";
    let stderrData = "";

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
                        Math.max(
                            0,
                            Math.floor((seconds / duration) * 100)
                        )
                    );
                }
            }
        }
    });

    ffmpeg.stderr.on("data", (data) => {
        stderrData += data.toString();

        // Éviter de conserver un journal trop volumineux
        if (stderrData.length > 10000) {
            stderrData = stderrData.slice(-10000);
        }

        console.error(data.toString());
    });

    ffmpeg.on("error", (error) => {
        removeFile(inputPath);
        removeFile(outputPath);

        job.status = "error";
        job.error = "Impossible de démarrer FFmpeg.";

        console.error("Erreur FFmpeg :", error);
    });

    ffmpeg.on("close", (code) => {
        removeFile(inputPath);

        if (code !== 0) {
            removeFile(outputPath);

            job.status = "error";
            job.error = "La conversion a échoué.";

            console.error("FFmpeg a échoué :", stderrData);

            return;
        }

        job.status = "completed";
        job.progress = 100;
        job.downloadUrl = `/download/${encodeURIComponent(outputName)}`;
    });

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
