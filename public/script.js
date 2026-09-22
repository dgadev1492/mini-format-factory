const $ = e => document.querySelector(e)

const form = $("#convertForm");
const videoInput = $("#video");
const formatInput = document.getElementById("format");

const convertButton = document.getElementById("convertButton");

const progressContainer = document.getElementById("progressContainer");
const progressBar = document.getElementById("progressBar");
const percentage = document.getElementById("percentage");
const statusText = document.getElementById("status");

const result = document.getElementById("result");

// Attendre un certain nombre de millisecondes
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Envoyer la vidéo et démarrer la conversion
form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const video = videoInput.files[0];

    if (!video) {
        result.textContent = "Sélectionne une vidéo.";
        return;
    }

    const formData = new FormData();

    formData.append("video", video);
    formData.append("format", formatInput.value);

    convertButton.disabled = true;
    result.textContent = "";

    progressContainer.style.display = "block";
    progressBar.value = 0;
    percentage.textContent = "0 %";
    statusText.textContent = "Envoi et préparation de la vidéo...";

    try {
        // Envoyer la vidéo au serveur
        const response = await fetch("/convert", {
            method: "POST",
            body: formData
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Impossible de démarrer la conversion.");
        }

        const jobId = data.jobId;

        statusText.textContent = "Conversion en cours...";

        // Interroger le serveur jusqu'à la fin du traitement
        while (true) {
            await sleep(1000);

            const progressResponse = await fetch(
                `/progress/${encodeURIComponent(jobId)}`
            );

            const job = await progressResponse.json();

            if (!progressResponse.ok) {
                throw new Error(job.error || "Impossible de récupérer la progression.");
            }

            progressBar.value = job.progress;
            percentage.textContent = `${job.progress} %`;

            if (job.status === "completed") {
                statusText.textContent = "Conversion terminée !";

                result.innerHTML = "";

                const link = document.createElement("a");

                link.href = job.downloadUrl;
                link.textContent = "Télécharger le fichier converti";

                result.appendChild(link);

                break;
            }

            if (job.status === "error") {
                throw new Error(job.error || "La conversion a échoué.");
            }
        }

    } catch (error) {
        statusText.textContent = "Une erreur est survenue.";
        result.textContent = error.message;

    } finally {
        convertButton.disabled = false;
    }
});
