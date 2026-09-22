import express from 'express'
import pool from '../../db/db.js'
import multer from 'multer'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { convertVideo,getProgress } from "../controllers/app.js";

const router = express.Router();

// Configuration de Multer
const storage = multer.diskStorage({
    destination: "uploads/",

    filename: (req, file, callback) => {
        const extension = path.extname(file.originalname);

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

router.get("/",(req,res)=>{
res.status(200).render("index")
})

// Route POST de conversion
router.post("/convert",
upload.single("video"),
convertVideo
);

//Route de Telechargement

router.get("/download/:filename", (req, res) => {
    const filename = req.params.filename;

    const allowedExtensions = [
        ".mp4",
        ".webm",
        ".mp3",
        ".wav"
    ];

    const extension = path.extname(filename);

    if (
        path.basename(filename) !== filename ||
        !allowedExtensions.includes(extension)
    ) {
        return res.status(400).send(
            "Nom de fichier invalide."
        );
    }

    const filePath = path.resolve("converted", filename);

    res.download(filePath, (error) => {
        if (error && !res.headersSent) {
            res.status(404).send(
                "Fichier introuvable."
            );
        }
    });
});

router.get("/progress/:id",getProgress)

//Gestion des erreur coté Multer
router.use((err,req,res,next)=>{
if(err instanceof Error){
return
res.status(400).json({error: err.message})
}

next(err)

})


export default router;
