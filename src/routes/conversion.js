import express from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";

import {
    convertVideo,
    getProgress
} from "../controllers/conversionController.js";

const router = express.Router();

// Chemins absolus
const rootDir = process.cwd();

const uploadsDir = path.join(rootDir, "uploads");
const convertedDir = path.join(rootDir, "converted");

// Création des dossiers si nécessaire
fs.mkdirSync(uploadsDir, { recursive: true });
fs.mkdirSync(convertedDir, { recursive: true });

// Configuration de Multer
const storage = multer.diskStorage({
    destination: (req, file, callback) => {
        callback(null, uploadsDir);
    },

    filename: (req, file, callback) => {
        const extension = path.extname(file.originalname).toLowerCase();

        callback(null, randomUUID() + extension);
    }
});

// Configuration de l'upload
const upload = multer({
    storage,

    limits: {
        fileSize: 500 * 1024 * 1024
    },

    fileFilter: (req, file, callback) => {
        if (!file.mimetype.startsWith("video/")) {
            return callback(
                new Error("Le fichier doit être une vidéo.")
            );
        }

        callback(null, true);
    }
});

// Page d'accueil
router.get("/", (req, res) => {
    res.status(200).render("index");
});

// Route POST de conversion
router.post(
    "/convert",
    upload.single("video"),
    convertVideo
);

// Route de téléchargement
router.get("/download/:filename", (req, res) => {
    const filename = req.params.filename;

    const allowedExtensions = [
        ".mp4",
        ".webm",
        ".mp3",
        ".wav"
    ];

    const extension = path.extname(filename).toLowerCase();

    if (
        path.basename(filename) !== filename ||
        !allowedExtensions.includes(extension)
    ) {
        return res.status(400).send(
            "Nom de fichier invalide."
        );
    }

    const filePath = path.join(convertedDir, filename);

    if (!fs.existsSync(filePath)) {
        return res.status(404).send(
            "Fichier introuvable."
        );
    }

    return res.download(filePath, filename, (error) => {
        if (error && !res.headersSent) {
            console.error("Erreur de téléchargement :", error);

            res.status(500).send(
                "Impossible de télécharger le fichier."
            );
        }
    });
});

// Route de suivi de progression
router.get("/progress/:id", getProgress);

// Gestion des erreurs de Multer
router.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        return res.status(400).json({
            error: err.message
        });
    }

    if (err) {
        return res.status(400).json({
            error: err.message || "Une erreur est survenue."
        });
    }

    next();
});

export default router;
